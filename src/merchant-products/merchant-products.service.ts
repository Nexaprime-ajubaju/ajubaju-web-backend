import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  NotFoundException,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { RedisService } from '../common/services/redis.service';
import { ModerationService } from '../moderation/moderation.service';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import {
  MerchantProduct,
  MerchantProductDocument,
} from './schemas/merchant-product.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { TransactionService } from '../common/services/transaction.service';

@Injectable()
export class MerchantProductsService implements OnModuleInit {
  private readonly logger = new Logger(MerchantProductsService.name);

  constructor(
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    private readonly SubscriptionsService: SubscriptionsService,
    private readonly redisService: RedisService,
    private readonly transactionService: TransactionService,
    private readonly moderationService: ModerationService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private cacheListKey(
    merchantId: string,
    query: ListMerchantProductsDto,
  ): string {
    return `golo:merchant:products:list:${merchantId}:${query.page || 1}:${query.limit || 10}:${(query.search || '').trim().toLowerCase()}`;
  }

  private cacheItemKey(merchantId: string, productId: string): string {
    return `golo:merchant:products:item:${merchantId}:${productId}`;
  }

  private async invalidateMerchantProductCache(
    merchantId: string,
  ): Promise<void> {
    await this.redisService.deleteByPattern(
      `golo:merchant:products:list:${merchantId}:*`,
    );
    await this.redisService.deleteByPattern(
      `golo:merchant:products:item:${merchantId}:*`,
    );
  }

  async onModuleInit() {
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for MerchantProductsService');
    }
  }

  private deriveStatus(
    stockQuantity: number,
  ): 'In Stock' | 'Low Stock' | 'Out of Stock' {
    if (stockQuantity <= 0) return 'Out of Stock';
    if (stockQuantity <= 10) return 'Low Stock';
    return 'In Stock';
  }

  private async moderateVideo(videoUrl: string, merchantId: string): Promise<void> {
    if (!videoUrl) return;

    try {
      if (videoUrl.includes('cloudinary.com') && videoUrl.includes('/video/upload/')) {
        const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf('.')); // removes .mp4 or .webm
        const urlWithoutExt = baseUrl;
        
        // Split around /upload/
        const parts = urlWithoutExt.split('/upload/');
        if (parts.length === 2) {
          const prefix = parts[0];
          const suffix = parts[1];
          
          const frame0 = `${prefix}/upload/so_0/${suffix}.jpg`;
          const frame30 = `${prefix}/upload/so_30p/${suffix}.jpg`;
          const frame70 = `${prefix}/upload/so_70p/${suffix}.jpg`;

          const frames = [frame0, frame30, frame70];

          for (const frame of frames) {
            const isSafe = await this.moderationService.isImageSafe(frame, merchantId);
            if (!isSafe) {
              throw new BadRequestException('The uploaded video contains inappropriate content and cannot be published.');
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Log other errors but don't fail the upload if it's just a parsing error
      console.error('Failed to moderate video:', error);
    }
  }

  async create(merchantId: string, dto: CreateMerchantProductDto) {
    if (dto.images && dto.images.length > 0 && this.moderationService) {
      for (const imageUrl of dto.images) {
        const isSafe = await this.moderationService.isImageSafe(imageUrl, merchantId);
        if (!isSafe) {
          throw new BadRequestException('One or more images contain inappropriate content and cannot be uploaded.');
        }
      }
    }

    const lockKey = `lock:merchant:product:create:${merchantId}`;
    let lockToken: string | null = null;

    if (this.redisService.isEnabled()) {
      lockToken = await this.redisService.acquireLock(lockKey, 5000);
      if (!lockToken) {
        throw new InternalServerErrorException(
          'Could not acquire merchant product creation lock. Please retry.',
        );
      }
    }

    try {
      const payload = {
        merchantId,
        name: dto.name.trim(),
        category: dto.category.trim(),
        stockQuantity: dto.stockQuantity,
        price: dto.price,
        description: dto.description?.trim() || '',
        images: dto.images || [],
        videoUrl: dto.videoUrl || null,
        status: this.deriveStatus(dto.stockQuantity),
      };

      if (dto.videoUrl) {
        await this.moderateVideo(dto.videoUrl, merchantId);
      }

      const product = await this.transactionService.execute(async (session) => {
        const merchant = await this.merchantModel
          .findOne({ userId: merchantId })
          .session(session)
          .exec();
        if (merchant) {
          const planDetails = await this.SubscriptionsService.getPlanDetails(
            merchant,
            session,
          );
          if (planDetails.planFeatures.maxProducts !== -1) {
            const totalProducts = await this.merchantProductModel
              .countDocuments({ merchantId })
              .session(session)
              .exec();
            if (totalProducts >= planDetails.planFeatures.maxProducts) {
              throw new ForbiddenException({
                success: false,
                statusCode: 403,
                errorCode: 'PRODUCT_LIMIT_REACHED',
                message: `${planDetails.name} merchants can only add up to ${planDetails.planFeatures.maxProducts} products. Please upgrade to a higher plan.`,
              });
            }
          }
        }

        const created = await this.merchantProductModel.create([payload], {
          session,
        });
        return created[0];
      });
      await this.invalidateMerchantProductCache(merchantId);

      if (this.kafkaService) {
        await this.kafkaService.emit(KAFKA_TOPICS.MERCHANT_PRODUCT_CREATED, {
          merchantId,
          productId: String(product._id),
          name: product.name,
          category: product.category,
          price: product.price,
          stockQuantity: product.stockQuantity,
        });
      }

      return {
        success: true,
        message: 'Product created successfully',
        data: this.mapProduct(product),
      };
    } finally {
      if (lockToken) {
        await this.redisService.releaseLock(lockKey, lockToken);
      }
    }
  }

  async listMyProducts(merchantId: string, query: ListMerchantProductsDto) {
    const cacheKey = this.cacheListKey(merchantId, query);
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<MerchantProductDocument> = { merchantId };

    if (query.search?.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: searchRegex }, { category: searchRegex }];
    }

    const merchant = await this.merchantModel.findOne({ userId: merchantId }).exec();
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    const planDetails = await this.SubscriptionsService.getPlanDetails(merchant);
    const maxProducts = planDetails.planFeatures.maxProducts;

    const [
      products,
      total,
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      inventoryAgg,
      topProducts,
    ] = await Promise.all([
      this.merchantProductModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.merchantProductModel.countDocuments(filter),
      this.merchantProductModel.countDocuments({ merchantId }),
      this.merchantProductModel.countDocuments({
        merchantId,
        stockQuantity: { $gt: 0, $lte: 10 },
      }),
      this.merchantProductModel.countDocuments({
        merchantId,
        stockQuantity: 0,
      }),
      this.merchantProductModel.aggregate([
        { $match: { merchantId } },
        {
          $group: {
            _id: null,
            total: {
              $sum: { $multiply: ['$price', '$stockQuantity'] },
            },
          },
        },
      ]),
      maxProducts === -1
        ? Promise.resolve(null)
        : this.merchantProductModel
            .find({ merchantId })
            .sort({ createdAt: -1 })
            .limit(maxProducts)
            .select('_id')
            .lean()
            .exec(),
    ]);

    const inventoryValue = inventoryAgg[0]?.total || 0;
    const eligibleIds = topProducts ? new Set(topProducts.map((p) => String(p._id))) : null;

    const response = {
      success: true,
      data: {
        products: products.map((product) => {
          const isEligible = maxProducts === -1 || eligibleIds.has(String(product._id));
          return {
            ...this.mapProduct(product),
            offerEligible: isEligible,
            ...(isEligible
              ? {}
              : {
                  offerEligibilityReason:
                    `Only your ${maxProducts} most recently created products can receive offers on your current tier.`,
                }),
          };
        }),
        stats: {
          totalProducts,
          inventoryValue,
          lowStockProducts,
          outOfStockProducts,
        },
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };

    await this.redisService.set(cacheKey, response, 120);
    return response;
  }

  async listProductsByMerchantId(
    merchantId: string,
    query: ListMerchantProductsDto,
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<MerchantProductDocument> = { merchantId };

    if (query.search?.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: searchRegex }, { category: searchRegex }];
    }

    const merchant = await this.merchantModel.findOne({ userId: merchantId }).exec();
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    const planDetails = await this.SubscriptionsService.getPlanDetails(merchant);
    const maxProducts = planDetails.planFeatures.maxProducts;

    const [products, total, topProducts] = await Promise.all([
      this.merchantProductModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.merchantProductModel.countDocuments(filter),
      maxProducts === -1
        ? Promise.resolve(null)
        : this.merchantProductModel
            .find({ merchantId })
            .sort({ createdAt: -1 })
            .limit(maxProducts)
            .select('_id')
            .lean()
            .exec(),
    ]);

    const eligibleIds = topProducts ? new Set(topProducts.map((p) => String(p._id))) : null;

    return {
      success: true,
      data: {
        products: products.map((product) => {
          const isEligible = maxProducts === -1 || eligibleIds.has(String(product._id));
          return {
            ...this.mapProduct(product),
            offerEligible: isEligible,
            ...(isEligible
              ? {}
              : {
                  offerEligibilityReason:
                    `Only your ${maxProducts} most recently created products can receive offers on your current tier.`,
                }),
          };
        }),
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  private async findProductOrThrow(productId: string) {
    try {
      const product = await this.merchantProductModel
        .findById(productId)
        .exec();
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      return product;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error?.name === 'CastError') {
        throw new NotFoundException('Product not found');
      }
      throw error;
    }
  }

  async getPublicProduct(productId: string) {
    const product = await this.findProductOrThrow(productId);

    return {
      success: true,
      data: this.mapProduct(product),
    };
  }

  async getProduct(merchantId: string, productId: string) {
    const cacheKey = this.cacheItemKey(merchantId, productId);
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.findProductOrThrow(productId);

    if (String(product.merchantId) !== String(merchantId)) {
      throw new ForbiddenException('You can only view your own products');
    }

    const response = {
      success: true,
      data: this.mapProduct(product),
    };

    await this.redisService.set(cacheKey, response, 300);
    return response;
  }

  async getPublicProductById(productId: string) {
    const product = await this.merchantProductModel.findById(productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      success: true,
      data: this.mapProduct(product),
    };
  }

  async updateProduct(
    merchantId: string,
    productId: string,
    dto: UpdateMerchantProductDto,
  ) {
    const product = await this.findProductOrThrow(productId);

    if (String(product.merchantId) !== String(merchantId)) {
      throw new ForbiddenException('You can only update your own products');
    }

    if (typeof dto.name === 'string') {
      product.name = dto.name.trim();
    }
    if (typeof dto.category === 'string') {
      product.category = dto.category.trim();
    }
    if (typeof dto.description === 'string') {
      product.description = dto.description.trim();
    }
    if (typeof dto.price === 'number') {
      product.price = dto.price;
    }
    if (typeof dto.stockQuantity === 'number') {
      product.stockQuantity = dto.stockQuantity;
      product.status = this.deriveStatus(dto.stockQuantity);
    }
    if (Array.isArray(dto.images)) {
      const sanitizedImages = dto.images
        .map((image) => String(image || '').trim())
        .filter(Boolean);

      if (sanitizedImages.length > 0) {
        for (const imageUrl of sanitizedImages) {
          const isSafe = await this.moderationService.isImageSafe(imageUrl, merchantId);
          if (!isSafe) {
            throw new BadRequestException('One or more images contain inappropriate content and cannot be uploaded.');
          }
        }
      }

      product.images = sanitizedImages;
    }

    await this.transactionService.execute(async (session) => {
      if (dto.videoUrl !== undefined) {
        if (dto.videoUrl !== null && dto.videoUrl !== product.videoUrl) {
          await this.moderateVideo(dto.videoUrl, merchantId);
        }
        product.videoUrl = dto.videoUrl;
      }

      await product.save({ session });
    });
    await this.invalidateMerchantProductCache(merchantId);

    return {
      success: true,
      message: 'Product updated successfully',
      data: this.mapProduct(product),
    };
  }

  async deleteProduct(merchantId: string, productId: string) {
    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (merchant) {
      const planDetails =
        await this.SubscriptionsService.getPlanDetails(merchant);
      if (!planDetails.planFeatures.canDeleteProduct) {
        throw new ForbiddenException({
          success: false,
          statusCode: 403,
          errorCode: 'PRODUCT_DELETE_NOT_ALLOWED',
          message:
            `${planDetails.name} merchants cannot delete products. Please upgrade to a higher plan.`,
        });
      }
    }

    const product = await this.findProductOrThrow(productId);

    if (String(product.merchantId) !== String(merchantId)) {
      throw new ForbiddenException('You can only delete your own products');
    }

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.MERCHANT_PRODUCT_DELETED, {
        merchantId,
        productId: String(product._id),
        name: product.name,
        category: product.category,
        price: product.price,
        stockQuantity: product.stockQuantity,
      });
    }

    await this.transactionService.execute(async (session) => {
      await this.merchantProductModel
        .findByIdAndDelete(productId, { session })
        .exec();
    });
    await this.invalidateMerchantProductCache(merchantId);

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  private mapProduct(product: MerchantProductDocument) {
    return {
      id: String(product._id),
      merchantId: String(product.merchantId),
      name: product.name,
      category: product.category,
      description: product.description,
      stockQuantity: product.stockQuantity,
      stock: `${product.stockQuantity} units`,
      price: product.price,
      priceLabel: `₹${product.price}`,
      status: product.status,
      image: product.images?.[0] || null,
      images: product.images || [],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}

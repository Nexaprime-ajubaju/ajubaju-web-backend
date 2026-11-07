import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  NotFoundException,
  OnModuleInit,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { RedisService } from '../common/services/redis.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationSecurityService } from '../security/moderation/moderation-security.service';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import {
  MerchantProduct,
  MerchantProductDocument,
} from './schemas/merchant-product.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import {
  OfferPromotion,
  OfferPromotionDocument,
} from '../offers/schemas/offer-promotion.schema';
import { TransactionService } from '../common/services/transaction.service';

@Injectable()
export class MerchantProductsService implements OnModuleInit {
  private readonly logger = new Logger(MerchantProductsService.name);

  constructor(
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(OfferPromotion.name)
    private readonly offerPromotionModel: Model<OfferPromotionDocument>,
    private readonly SubscriptionsService: SubscriptionsService,
    private readonly redisService: RedisService,
    private readonly transactionService: TransactionService,
    private readonly moderationService: ModerationService,
    private readonly moderationSecurityService: ModerationSecurityService,
    @Optional() private readonly kafkaService?: KafkaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
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

  onModuleInit() {
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

  private async moderateVideo(
    videoUrl: string,
    merchantId: string,
  ): Promise<void> {
    if (!videoUrl) return;

    try {
      if (
        videoUrl.includes('cloudinary.com') &&
        videoUrl.includes('/video/upload/')
      ) {
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
            const isSafe = await this.moderationService.isImageSafe(
              frame,
              merchantId,
            );
            if (!isSafe) {
              await this.moderationSecurityService.handleFailure(
                merchantId,
                'new_product',
                frame,
                'INAPPROPRIATE_CONTENT',
                'multi',
              );
              throw new BadRequestException(
                'The uploaded video contains inappropriate content and cannot be published.',
              );
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
    await this.moderationSecurityService.checkRestriction(merchantId);

    if (dto.images && dto.images.length > 0 && this.moderationService) {
      for (const imageUrl of dto.images) {
        const isSafe = await this.moderationService.isImageSafe(
          imageUrl,
          merchantId,
        );
        if (!isSafe) {
          await this.moderationSecurityService.handleFailure(
            merchantId,
            'new_product',
            imageUrl,
            'INAPPROPRIATE_CONTENT',
            'multi',
          );
          throw new BadRequestException(
            'One or more images contain inappropriate content and cannot be uploaded.',
          );
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
      const payload: any = {
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

      const merchant = await this.merchantModel
        .findOne({ userId: merchantId })
        .exec();
      if (merchant) {
        const planDetails =
          await this.SubscriptionsService.getPlanDetails(merchant);
        if (planDetails.planFeatures.maxProducts !== -1) {
          const totalProductsCount = await this.merchantProductModel
            .countDocuments({ merchantId })
            .exec();

          if (totalProductsCount >= planDetails.planFeatures.maxProducts) {
            payload.isActive = false;

            // Force the merchant to re-select active products since they now have more products than their plan allows
            await this.merchantModel.findOneAndUpdate(
              { _id: merchant._id },
              { $set: { hasSelectedActiveProducts: false } }
            ).exec();
          } else {
            payload.isActive = true;
          }
        } else {
          payload.isActive = true;
        }
      }

      const product = await this.merchantProductModel.create(payload);
      await this.invalidateMerchantProductCache(merchantId);

      if (this.eventEmitter) {
        try {
          this.eventEmitter.emit('product.created', {
            productId: String(product._id),
            name: product.name,
            category: product.category,
            description: product.description,
            merchantId,
            merchantName: merchant?.storeName || (merchant as any)?.name,
            price: product.price,
            imageUrl: (product.images && product.images[0]) || null,
          });
        } catch (_emitErr) {}
      }

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
    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    const planDetails =
      await this.SubscriptionsService.getPlanDetails(merchant);
    const maxProducts = planDetails.planFeatures.maxProducts;

    const dbTotalProducts = await this.merchantProductModel.countDocuments({
      merchantId,
    });
    if (maxProducts === -1 || dbTotalProducts <= maxProducts) {
      const inactiveCount = await this.merchantProductModel.countDocuments({
        merchantId,
        isActive: false,
      });
      if (inactiveCount > 0 || !merchant.hasSelectedActiveProducts) {
        await this.merchantProductModel.updateMany(
          { merchantId },
          { isActive: true, lastActivatedAt: new Date() },
        );
        await this.merchantModel.findOneAndUpdate(
          { _id: merchant._id },
          { $set: { hasSelectedActiveProducts: true } }
        ).exec();
        merchant.hasSelectedActiveProducts = true;
        await this.invalidateMerchantProductCache(merchantId);
      }
    }

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

    const [
      products,
      total,
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      inventoryAgg,
      topProducts,
      actualActiveCount,
    ] = await Promise.all([
      this.merchantProductModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.merchantProductModel.countDocuments(filter),
      Promise.resolve(dbTotalProducts),
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
      this.merchantProductModel.countDocuments({
        merchantId,
        isActive: { $ne: false },
      }),
    ]);

    const inventoryValue = inventoryAgg[0]?.total || 0;
    const eligibleIds = topProducts
      ? new Set(topProducts.map((p) => String(p._id)))
      : null;

    const needsActiveProductsSelection =
      maxProducts !== -1 &&
      totalProducts > maxProducts &&
      (!merchant.hasSelectedActiveProducts ||
        actualActiveCount !== maxProducts);

    const response = {
      success: true,
      data: {
        products: products.map((product) => {
          const isEligible =
            maxProducts === -1 || eligibleIds.has(String(product._id));
          return {
            ...this.mapProduct(product),
            offerEligible: isEligible,
            ...(isEligible
              ? {}
              : {
                  offerEligibilityReason: `Only your ${maxProducts} most recently created products can receive offers on your current tier.`,
                }),
          };
        }),
        stats: {
          totalProducts,
          inventoryValue,
          lowStockProducts,
          outOfStockProducts,
        },
        needsActiveProductsSelection,
        maxActiveProducts: maxProducts,
        hasSelectedActiveProducts: maxProducts === -1 ? true : (merchant.hasSelectedActiveProducts || false),
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

    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    const planDetails =
      await this.SubscriptionsService.getPlanDetails(merchant);
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

    const eligibleIds = topProducts
      ? new Set(topProducts.map((p) => String(p._id)))
      : null;

    return {
      success: true,
      data: {
        products: products.map((product) => {
          const isEligible =
            maxProducts === -1 || eligibleIds.has(String(product._id));
          return {
            ...this.mapProduct(product),
            offerEligible: isEligible,
            ...(isEligible
              ? {}
              : {
                  offerEligibilityReason: `Only your ${maxProducts} most recently created products can receive offers on your current tier.`,
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

  async incrementViewCount(productId: string) {
    const product = await this.merchantProductModel
      .findByIdAndUpdate(productId, { $inc: { views: 1 } }, { new: true })
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return { success: true, views: product.views };
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

  async searchGlobalProducts(
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const regex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;

    const products = await this.merchantProductModel
      .find({
        status: 'active',
        isVisible: true,
        $or: [
          { productName: { $regex: regex } },
          { description: { $regex: regex } },
          { category: { $regex: regex } },
        ],
      })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    return {
      success: true,
      data: products,
    };
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
    await this.moderationSecurityService.checkRestriction(merchantId);

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
        .map((image) => {
          let str = String(image || '').trim();
          const publicUrl = (
            process.env.CLOUDFLARE_R2_PUBLIC_URL ||
            process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ||
            ''
          ).trim().replace(/\/+$/, '');

          const isR2 =
            str.includes('/api/media/') ||
            str.includes('.r2.dev') ||
            str.includes('.cloudflarestorage.com') ||
            Boolean(publicUrl && str.startsWith(publicUrl));

          if (!isR2) {
            if (str.startsWith('/media/')) {
              str = `https://res.cloudinary.com/${str.replace(/^\/media\//, '')}`;
            } else {
              const mediaIdx = str.indexOf('/media/');
              if (mediaIdx !== -1 && !str.includes('res.cloudinary.com')) {
                str = `https://res.cloudinary.com/${str.slice(mediaIdx + 7)}`;
              }
            }
          }
          return str;
        })
        .filter(Boolean);

      if (sanitizedImages.length > 0) {
        for (const imageUrl of sanitizedImages) {
          const isSafe = await this.moderationService.isImageSafe(
            imageUrl,
            merchantId,
          );
          if (!isSafe) {
            await this.moderationSecurityService.handleFailure(
              merchantId,
              String(product._id),
              imageUrl,
              'INAPPROPRIATE_CONTENT',
              'multi',
            );
            throw new BadRequestException(
              'One or more images contain inappropriate content and cannot be uploaded.',
            );
          }
        }
      }

      product.images = sanitizedImages;
    }

    if (dto.videoUrl !== undefined) {
      let vUrl = dto.videoUrl;
      if (typeof vUrl === 'string') {
        const publicUrl = (
          process.env.CLOUDFLARE_R2_PUBLIC_URL ||
          process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ||
          ''
        ).trim().replace(/\/+$/, '');

        const isR2 =
          vUrl.includes('/api/media/') ||
          vUrl.includes('.r2.dev') ||
          vUrl.includes('.cloudflarestorage.com') ||
          Boolean(publicUrl && vUrl.startsWith(publicUrl));

        if (!isR2) {
          if (vUrl.startsWith('/media/')) {
            vUrl = `https://res.cloudinary.com/${vUrl.replace(/^\/media\//, '')}`;
          } else {
            const mediaIdx = vUrl.indexOf('/media/');
            if (mediaIdx !== -1 && !vUrl.includes('res.cloudinary.com')) {
              vUrl = `https://res.cloudinary.com/${vUrl.slice(mediaIdx + 7)}`;
            }
          }
        }
      }
      if (vUrl !== null && vUrl !== product.videoUrl) {
        await this.moderateVideo(vUrl, merchantId);
      }
      product.videoUrl = vUrl;
    }

    await product.save();
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
          message: `${planDetails.name} merchants cannot delete products. Please upgrade to a higher plan.`,
        });
      }
    }

    const product = await this.findProductOrThrow(productId);

    if (String(product.merchantId) !== String(merchantId)) {
      throw new ForbiddenException('You can only delete your own products');
    }

    // Check if the product is linked to any active offers
    const activeOffers = await this.offerPromotionModel
      .find({
        merchantId,
        'selectedProducts.productId': productId,
        status: { $in: ['active', 'approved', 'under_review'] },
      })
      .exec();

    // Filter out offers that have actually expired by date
    const now = new Date();
    const currentlyActiveOffers = activeOffers.filter((offer) => {
      if (offer.endDate && new Date(offer.endDate).getTime() < now.getTime())
        return false;
      return true;
    });

    if (currentlyActiveOffers.length > 0) {
      // Check if any active offer has ONLY this product
      const singleProductOffer = currentlyActiveOffers.find(
        (offer) => offer.selectedProducts.length === 1,
      );
      if (singleProductOffer) {
        throw new ConflictException({
          success: false,
          statusCode: 409,
          errorCode: 'PRODUCT_LINKED_TO_ACTIVE_OFFER',
          message:
            'Cannot delete product. It is the only product in an active offer. Please delete the offer first.',
        });
      }

      // If all active offers have > 1 product, pull this product from them
      for (const offer of currentlyActiveOffers) {
        offer.selectedProducts = offer.selectedProducts.filter(
          (p) => p.productId !== productId,
        );
        // Recalculate total price if needed (assuming simple sum, or just let it be)
        offer.totalPrice = offer.selectedProducts.reduce(
          (sum, p) => sum + p.offerPrice,
          0,
        );
        await offer.save();
      }
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

    await this.merchantProductModel.findByIdAndDelete(productId).exec();
    await this.invalidateMerchantProductCache(merchantId);

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  async toggleProductActiveStatus(
    productId: string,
    merchantId: string,
    isActive: boolean,
  ) {
    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    let planDetails: any = null;
    if (merchant) {
      planDetails = await this.SubscriptionsService.getPlanDetails(merchant);
      if (planDetails.planFeatures.maxProducts !== -1 && merchant.hasSelectedActiveProducts) {
        throw new ForbiddenException(
          'You have already finalized your active products selection. Individual product status toggles are disabled.',
        );
      }
    }

    const product = await this.merchantProductModel.findOne({
      _id: productId,
      merchantId,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (isActive) {
      // Check limits
      if (merchant && planDetails) {
        if (planDetails.planFeatures.maxProducts !== -1) {
          const activeProducts = await this.merchantProductModel.countDocuments(
            {
              merchantId,
              isActive: { $ne: false },
            },
          );
          if (activeProducts >= planDetails.planFeatures.maxProducts) {
            throw new ForbiddenException({
              success: false,
              statusCode: 403,
              errorCode: 'PRODUCT_LIMIT_REACHED',
              message: `You can only have up to ${planDetails.planFeatures.maxProducts} active products on your current plan.`,
            });
          }
        }
      }
      product.lastActivatedAt = new Date();
    } else {
      if (product.lastActivatedAt) {
        const freezePeriodMs = 30 * 24 * 60 * 60 * 1000;
        const timeSinceActivation =
          Date.now() - new Date(product.lastActivatedAt).getTime();
        if (timeSinceActivation < freezePeriodMs) {
          throw new BadRequestException(
            'Product cannot be deactivated until the 30-day freeze period expires.',
          );
        }
      }
    }

    product.isActive = isActive;
    await product.save();
    await this.invalidateMerchantProductCache(merchantId);

    return {
      success: true,
      message: `Product ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: this.mapProduct(product as any),
    };
  }

  async finalizeActiveProducts(merchantId: string, productIds: string[]) {
    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    const planDetails =
      await this.SubscriptionsService.getPlanDetails(merchant);
    const maxProducts = planDetails.planFeatures.maxProducts;

    if (maxProducts !== -1 && merchant.hasSelectedActiveProducts) {
      throw new BadRequestException(
        'You have already finalized your active products selection. This selection cannot be edited.',
      );
    }

    const totalProducts = await this.merchantProductModel.countDocuments({
      merchantId,
    });
    const expectedCount = Math.min(maxProducts, totalProducts);

    if (maxProducts !== -1 && productIds.length !== expectedCount) {
      throw new BadRequestException(
        `You must select exactly ${expectedCount} active product${expectedCount === 1 ? '' : 's'}.`,
      );
    }

    // Verify all productIds belong to this merchant
    const count = await this.merchantProductModel.countDocuments({
      _id: { $in: productIds },
      merchantId,
    });
    if (count !== productIds.length) {
      throw new BadRequestException(
        'One or more selected products do not belong to you.',
      );
    }

    // Deactivate all products first
    await this.merchantProductModel.updateMany(
      { merchantId },
      { isActive: false },
    );

    // Activate selected products
    if (productIds.length > 0) {
      await this.merchantProductModel.updateMany(
        { _id: { $in: productIds }, merchantId },
        { isActive: true, lastActivatedAt: new Date() },
      );
    }

    // Mark selection as finalized
    await this.merchantModel.findOneAndUpdate(
      { _id: merchant._id },
      { $set: { hasSelectedActiveProducts: true } }
    ).exec();

    await this.invalidateMerchantProductCache(merchantId);

    return {
      success: true,
      message: 'Active products selection finalized successfully',
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
      isActive: product.isActive !== false,
      image: product.images?.[0] || null,
      images: product.images || [],
      lastActivatedAt: product.lastActivatedAt || null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}

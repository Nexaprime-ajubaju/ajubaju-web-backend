import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Product, ProductDocument } from './schemas/product.schema';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { MerchantPlanService } from '../merchant-plan/merchant-plan.service';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Merchant.name) private merchantModel: Model<MerchantDocument>,
    private readonly merchantPlanService: MerchantPlanService,
  ) {}

  async createProduct(
    merchantId: string,
    createProductDto: CreateProductDto,
  ): Promise<Product> {
    const merchant = await this.merchantModel.findOne({ userId: merchantId }).exec();
    if (merchant) {
      const planDetails = await this.merchantPlanService.getPlanDetails(merchant);
      if (!planDetails.planFeatures.canAddProduct) {
        throw new ForbiddenException('Free Tier merchants cannot add new products. Please upgrade to Premium.');
      }
    }

    const productId = `PROD_${uuidv4()}`;

    const product = new this.productModel({
      productId,
      merchantId,
      ...createProductDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await product.save();
    return product;
  }

  async getProductsByMerchant(
    merchantId: string,
    skip = 0,
    limit = 20,
  ): Promise<{ data: Product[]; total: number }> {
    const [data, total] = await Promise.all([
      this.productModel
        .find({ merchantId, isVisible: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.productModel.countDocuments({ merchantId, isVisible: true }),
    ]);

    // Compute offerEligible for the latest 10 created products
    const processedData = data.map((product, index) => {
      const globalIndex = skip + index;
      return {
        ...product,
        offerEligible: globalIndex < 10,
      };
    });

    return { data: processedData as Product[], total };
  }

  async getProductById(
    productId: string,
    merchantId?: string,
  ): Promise<Product> {
    const product = await this.productModel.findOne({ productId }).lean().exec();

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (merchantId && product.merchantId !== merchantId) {
      throw new ForbiddenException('You do not have access to this product');
    }

    return product;
  }

  async updateProduct(
    productId: string,
    merchantId: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.productModel
      .findOne({ productId, merchantId })
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found or unauthorized');
    }

    Object.assign(product, updateProductDto);
    product.updatedAt = new Date();

    await product.save();
    return product;
  }

  async deleteProduct(
    productId: string,
    merchantId: string,
  ): Promise<Product> {
    const merchant = await this.merchantModel.findOne({ userId: merchantId }).exec();
    if (merchant) {
      const planDetails = await this.merchantPlanService.getPlanDetails(merchant);
      if (!planDetails.planFeatures.canDeleteProduct) {
        throw new ForbiddenException('Free Tier merchants cannot delete products. Please upgrade to Premium.');
      }
    }

    const product = await this.productModel
      .findOne({ productId, merchantId })
      .exec();

    if (!product) {
      throw new NotFoundException('Product not found or unauthorized');
    }

    // Soft delete by marking as invisible
    product.isVisible = false;
    product.status = 'discontinued';
    product.updatedAt = new Date();

    await product.save();
    return product;
  }

  async searchProducts(query: string, merchantId?: string): Promise<Product[]> {
    const searchFilter: any = {
      isVisible: true,
      $or: [
        { productName: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
      ],
    };

    if (merchantId) {
      searchFilter.merchantId = merchantId;
    }

    return this.productModel
      .find(searchFilter)
      .limit(10)
      .lean()
      .exec();
  }

  async getProductsByCategory(
    category: string,
    merchantId?: string,
  ): Promise<Product[]> {
    const filter: any = {
      category: { $regex: category, $options: 'i' },
      isVisible: true,
      status: 'active',
    };

    if (merchantId) {
      filter.merchantId = merchantId;
    }

    return this.productModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();
  }

  async updateViewCount(productId: string): Promise<void> {
    await this.productModel
      .updateOne({ productId }, { $inc: { views: 1 } })
      .exec();
  }

  async updatePurchaseCount(productId: string): Promise<void> {
    await this.productModel
      .updateOne({ productId }, { $inc: { purchases: 1 } })
      .exec();
  }

  async getMerchantProductStats(merchantId: string): Promise<any> {
    const products = await this.productModel
      .find({ merchantId, isVisible: true })
      .lean()
      .exec();

    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
    const totalValue = products.reduce(
      (sum, p) => sum + p.regularPrice * (p.stockQuantity || 0),
      0,
    );
    const totalViews = products.reduce((sum, p) => sum + (p.views || 0), 0);
    const totalPurchases = products.reduce((sum, p) => sum + (p.purchases || 0), 0);

    return {
      totalProducts,
      totalStock,
      totalValue,
      totalViews,
      totalPurchases,
    };
  }
}

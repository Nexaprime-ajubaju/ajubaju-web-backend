import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProductFeature,
  ProductFeatureDocument,
} from './product-feature.schema';

@Injectable()
export class ProductFeatureService {
  private readonly logger = new Logger(ProductFeatureService.name);

  constructor(
    @InjectModel(ProductFeature.name)
    private readonly featureModel: Model<ProductFeatureDocument>,
  ) {}

  async getFeatures(
    productIds: string[],
  ): Promise<Record<string, ProductFeature>> {
    const features = await this.featureModel
      .find({ productId: { $in: productIds } })
      .lean();
    const map: Record<string, ProductFeature> = {};
    features.forEach((f) => {
      map[f.productId] = f as ProductFeature;
    });
    return map;
  }
}

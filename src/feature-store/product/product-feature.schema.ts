import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductFeatureDocument = ProductFeature & Document;

@Schema({ timestamps: true })
export class ProductFeature {
  @Prop({ required: true, unique: true, index: true })
  productId: string;

  @Prop({ default: 0 })
  popularityScore: number;

  @Prop({ default: 0 })
  freshnessScore: number;

  @Prop({ default: 0 })
  merchantRating: number;

  @Prop({ default: 0 })
  conversionRate: number;

  @Prop({ default: 0 })
  ctr: number;

  @Prop({ default: 0 })
  wishlistRate: number;

  @Prop({ default: 0 })
  cartRate: number;

  @Prop({ default: 0 })
  inventoryScore: number;

  @Prop({ default: 0 })
  priceCompetitiveness: number;

  @Prop({ default: 0 })
  returnRate: number;

  @Prop({ default: 0 })
  discountQuality: number;

  @Prop({ default: 0 })
  merchantResponseTime: number;

  @Prop({ default: 0 })
  merchantFulfillmentRate: number;

  @Prop()
  updatedAt?: Date;
}

export const ProductFeatureSchema =
  SchemaFactory.createForClass(ProductFeature);

ProductFeatureSchema.index({ productId: 1 });
ProductFeatureSchema.index({ updatedAt: -1 });

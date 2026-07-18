import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SimilarProductDocument = SimilarProduct & Document;

@Schema({ timestamps: true, collection: 'similar_products' })
export class SimilarProduct {
  @Prop({ required: true, index: true, type: Types.ObjectId })
  productId: Types.ObjectId;

  @Prop({ required: true, index: true, type: Types.ObjectId })
  similarProductId: Types.ObjectId;

  @Prop({ required: true })
  similarityScore: number;

  @Prop({ type: [String], default: [] })
  matchedTags: string[];

  @Prop({ default: false })
  matchedCategory: boolean;

  @Prop({ default: false })
  matchedMerchant: boolean;

  @Prop({ default: false })
  matchedPriceRange: boolean;

  @Prop({ required: true })
  algorithmVersion: string;
}

export const SimilarProductSchema =
  SchemaFactory.createForClass(SimilarProduct);

SimilarProductSchema.index({ productId: 1 });
// Compound index for fast querying per product and sorting by score
SimilarProductSchema.index({ productId: 1, similarityScore: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductRelationshipDocument = ProductRelationship & Document;

@Schema({ timestamps: true })
export class ProductRelationship {
  @Prop({ required: true, index: true })
  productId: string;

  @Prop({ required: true, index: true })
  relatedProductId: string;

  @Prop({ required: true, default: 'frequently_bought_together' })
  relationType: string;

  @Prop({ required: true, default: 0 })
  score: number; // Confidence score or raw co-purchase count

  @Prop()
  updatedAt?: Date;
}

export const ProductRelationshipSchema =
  SchemaFactory.createForClass(ProductRelationship);

// Compound index for querying a product's highest-scored relations
ProductRelationshipSchema.index({ productId: 1, relationType: 1, score: -1 });

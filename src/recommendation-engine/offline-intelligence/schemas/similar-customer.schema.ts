import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SimilarCustomerDocument = SimilarCustomer & Document;

@Schema({ timestamps: true, collection: 'similar_customers' })
export class SimilarCustomer {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  similarUserId: string;

  @Prop({ required: true })
  similarityScore: number;

  @Prop({ type: [String], default: [] })
  recommendedProductIds: string[];
}

export const SimilarCustomerSchema = SchemaFactory.createForClass(SimilarCustomer);

SimilarCustomerSchema.index({ userId: 1 });
SimilarCustomerSchema.index({ userId: 1, similarityScore: -1 });

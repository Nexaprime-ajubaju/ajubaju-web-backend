import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RecommendationLogDocument = RecommendationLog & Document;

@Schema({ timestamps: true })
export class RecommendationLog {
  @Prop({ required: true })
  strategy: string;

  @Prop()
  executionTime?: number;

  @Prop({ default: false })
  cacheHit: boolean;

  @Prop()
  productCount?: number;

  @Prop()
  userId?: string;

  @Prop()
  error?: string;

  @Prop()
  requestId?: string;

  @Prop({ default: 'default' })
  variant: string;

  @Prop({ type: [{ productId: String, rank: Number }], default: [] })
  results: { productId: string, rank: number }[];

  @Prop({ type: Date, expires: '30d', default: Date.now }) // TTL index for 30 days
  createdAt: Date;
}

export const RecommendationLogSchema = SchemaFactory.createForClass(RecommendationLog);

RecommendationLogSchema.index({ requestId: 1 });
RecommendationLogSchema.index({ userId: 1 });
RecommendationLogSchema.index({ strategy: 1, variant: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RecommendationMetricDocument = RecommendationMetric & Document;

@Schema({ timestamps: true, collection: 'recommendation_metrics' })
export class RecommendationMetric {
  @Prop({ required: true })
  strategy: string;

  @Prop({ required: true })
  variant: string;

  @Prop({ required: true })
  timeWindow: string; // e.g. '2026-06-30T00:00:00Z' (hourly bucket)

  @Prop({ default: 0 })
  served: number;

  @Prop({ default: 0 })
  viewed: number;

  @Prop({ default: 0 })
  clicked: number;

  @Prop({ default: 0 })
  wishlisted: number;

  @Prop({ default: 0 })
  carted: number;

  @Prop({ default: 0 })
  purchased: number;

  @Prop({ default: 0 })
  revenue: number;

  @Prop({ default: 0 })
  averageRank: number;

  @Prop({ default: 0 })
  coverage: number;

  // Derived metrics can be stored or computed on the fly
  @Prop({ default: 0 })
  ctr: number;

  @Prop({ default: 0 })
  cvr: number;
}

export const RecommendationMetricSchema =
  SchemaFactory.createForClass(RecommendationMetric);
RecommendationMetricSchema.index(
  { strategy: 1, variant: 1, timeWindow: 1 },
  { unique: true },
);

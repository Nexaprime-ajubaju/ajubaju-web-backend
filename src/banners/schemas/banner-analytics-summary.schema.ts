import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerAnalyticsSummaryDocument = BannerAnalyticsSummary & Document;

@Schema({ timestamps: true, collection: 'banner_analytics_summaries' })
export class BannerAnalyticsSummary {
  @Prop({ required: true, index: true })
  bannerId: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true, index: true })
  dateStr: string; // YYYY-MM-DD format

  @Prop({ required: true, default: 0 })
  impressionsCount: number;

  @Prop({ required: true, default: 0 })
  clicksCount: number;

  @Prop({ required: true, default: 0 })
  ctrPercentage: number;
}

export const BannerAnalyticsSummarySchema = SchemaFactory.createForClass(
  BannerAnalyticsSummary,
);
BannerAnalyticsSummarySchema.index(
  { bannerId: 1, dateStr: 1 },
  { unique: true },
);

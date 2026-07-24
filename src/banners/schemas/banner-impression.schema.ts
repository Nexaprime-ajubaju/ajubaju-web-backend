import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerImpressionDocument = BannerImpression & Document;

@Schema({ timestamps: true, collection: 'banner_impressions' })
export class BannerImpression {
  @Prop({ required: true, index: true })
  bannerId: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ default: 'anonymous', index: true })
  userId: string;

  @Prop({ required: true, index: true })
  city: string;

  @Prop({ required: true, min: 1, max: 9 })
  slot: number;

  @Prop({ required: true, default: 0 })
  generation: number;

  @Prop({ required: true, default: Date.now, index: true })
  shownAt: Date;
}

export const BannerImpressionSchema =
  SchemaFactory.createForClass(BannerImpression);

BannerImpressionSchema.index({ bannerId: 1, shownAt: -1 });
BannerImpressionSchema.index({ city: 1, shownAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerClickDocument = BannerClick & Document;

@Schema({ timestamps: true, collection: 'banner_clicks' })
export class BannerClick {
  @Prop({ required: true, index: true })
  bannerId: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ default: 'anonymous', index: true })
  userId: string;

  @Prop({ default: 'global', index: true })
  city: string;

  @Prop({ required: true, default: Date.now, index: true })
  clickedAt: Date;
}

export const BannerClickSchema = SchemaFactory.createForClass(BannerClick);

BannerClickSchema.index({ bannerId: 1, clickedAt: -1 });
BannerClickSchema.index({ merchantId: 1, clickedAt: -1 });

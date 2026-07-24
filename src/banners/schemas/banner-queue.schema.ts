import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerQueueDocument = BannerQueue & Document;

@Schema({ timestamps: true, collection: 'banner_city_queues' })
export class BannerQueue {
  @Prop({ required: true, unique: true, index: true })
  city: string;

  @Prop({ type: [String], default: [] })
  queue: string[];

  @Prop({ required: true, default: 1 })
  version: number;

  @Prop({ required: true, default: 1 })
  activeVersion: number;

  @Prop({ required: true, default: 1 })
  pendingVersion: number;

  @Prop({ required: true, default: 0 })
  totalCampaigns: number;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const BannerQueueSchema = SchemaFactory.createForClass(BannerQueue);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type RecommendationEventDocument = RecommendationEvent & Document;

@Schema({ timestamps: true })
export class RecommendationEvent {
  @Prop({ required: true, default: 1 })
  version: number;

  @Prop()
  userId?: string;

  @Prop()
  sessionId?: string;

  @Prop({ required: true })
  strategy: string;

  @Prop()
  sectionKey?: string;

  @Prop()
  productId?: string;

  @Prop()
  merchantId?: string;

  @Prop()
  position?: number;

  @Prop()
  requestId?: string;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop()
  categoryId?: string;

  @Prop({ required: true })
  eventType: string; // 'impression', 'click', 'add_to_cart', 'wishlist', 'purchase'

  @Prop()
  page?: number;

  @Prop()
  city?: string;

  @Prop()
  area?: string;

  @Prop()
  device?: string;

  @Prop()
  platform?: string;

  @Prop()
  source?: string;

  @Prop({ type: Date, expires: '90d', default: Date.now }) // TTL index for 90 days
  createdAt: Date;
}

export const RecommendationEventSchema = SchemaFactory.createForClass(RecommendationEvent);

RecommendationEventSchema.index({ userId: 1, createdAt: -1 });
RecommendationEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
RecommendationEventSchema.index({ productId: 1, eventType: 1 });
RecommendationEventSchema.index({ strategy: 1, createdAt: -1 });
RecommendationEventSchema.index({ requestId: 1 });

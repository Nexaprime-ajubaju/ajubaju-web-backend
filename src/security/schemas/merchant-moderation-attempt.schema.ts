import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MerchantModerationAttemptDocument = MerchantModerationAttempt &
  Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'merchant_moderation_attempts',
})
export class MerchantModerationAttempt {
  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true })
  offerId: string;

  @Prop({ required: true })
  imageHash: string;

  @Prop({ required: true })
  failureReason: string;

  // TTL index to automatically delete records after 35 days (3024000 seconds)
  @Prop({ type: Date, default: Date.now, expires: 3024000 })
  createdAt: Date;
}

export const MerchantModerationAttemptSchema = SchemaFactory.createForClass(
  MerchantModerationAttempt,
);
MerchantModerationAttemptSchema.index({ merchantId: 1, createdAt: 1 });

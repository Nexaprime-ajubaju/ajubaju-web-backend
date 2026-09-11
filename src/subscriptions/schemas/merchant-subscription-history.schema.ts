import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MerchantSubscriptionHistoryDocument = MerchantSubscriptionHistory &
  Document;

@Schema({ timestamps: true })
export class MerchantSubscriptionHistory {
  @Prop({ required: true, type: String })
  merchantId: string; // The userId of the merchant

  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', default: null })
  oldPlanId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', required: true })
  newPlanId: Types.ObjectId;

  @Prop({ required: true })
  changedBy: string; // "system", "admin_userId", "merchant_userId"

  @Prop({ required: true })
  reason: string; // "Admin assigned", "Trial expired", "Upgraded", etc.

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MerchantSubscriptionHistorySchema = SchemaFactory.createForClass(
  MerchantSubscriptionHistory,
);

MerchantSubscriptionHistorySchema.index({ merchantId: 1 });
MerchantSubscriptionHistorySchema.index({ createdAt: -1 }); // Performance index

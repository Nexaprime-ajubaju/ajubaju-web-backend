import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MerchantBannerCreditsDocument = MerchantBannerCredits & Document;

@Schema({ timestamps: true, optimisticConcurrency: true })
export class MerchantBannerCredits {
  @Prop({ required: true, type: String })
  merchantId: string; // The userId of the merchant

  @Prop({ required: true, type: String })
  month: string; // e.g., "2026-07"

  @Prop({ required: true, default: 0 })
  totalCreditsAllocated: number; // For the month based on the plan

  @Prop({ required: true, default: 0 })
  usedCredits: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MerchantBannerCreditsSchema = SchemaFactory.createForClass(
  MerchantBannerCredits,
);

// A merchant has one credit record per month
MerchantBannerCreditsSchema.index(
  { merchantId: 1, month: 1 },
  { unique: true },
);

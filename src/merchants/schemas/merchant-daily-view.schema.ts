import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class MerchantDailyView extends Document {
  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true, index: true })
  date: string; // Format: YYYY-MM-DD

  @Prop({ default: 0 })
  views: number;
}

export const MerchantDailyViewSchema =
  SchemaFactory.createForClass(MerchantDailyView);

// Ensure a merchant only has one entry per day
MerchantDailyViewSchema.index({ merchantId: 1, date: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemSettingsDocument = SystemSettings & Document;

@Schema({ timestamps: true, optimisticConcurrency: true })
export class SystemSettings {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ default: 50 })
  merchantTrialDays: number;

  @Prop({ default: 0 })
  merchantTrialHours: number;

  @Prop({ default: 0 })
  merchantTrialMinutes: number;

  @Prop({ default: 10 })
  freeTierMaxProducts: number;

  @Prop({ default: 5 })
  freeTierMaxMonthlyOffersFirst2Months: number;

  @Prop({ default: 2 })
  freeTierMaxMonthlyOffersAfter2Months: number;

  @Prop({ default: 60 })
  freeTierMaxOfferDurationDays: number;

  @Prop({ default: false })
  applyTrialChangesToExistingMerchants: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SystemSettingsSchema =
  SchemaFactory.createForClass(SystemSettings);

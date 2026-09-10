import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReferralDocument = Referral & Document;

export enum ReferralStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
}

@Schema({ timestamps: true })
export class Referral {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referrerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referredUserId: Types.ObjectId;

  @Prop({ enum: ReferralStatus, default: ReferralStatus.PENDING })
  status: ReferralStatus;

  @Prop({ type: String, default: 'SUBSCRIPTION_EXTENSION' })
  rewardType: string;

  @Prop({ type: Number, default: 15 })
  rewardDays: number;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
ReferralSchema.index({ referrerId: 1 });
ReferralSchema.index({ referredUserId: 1 });

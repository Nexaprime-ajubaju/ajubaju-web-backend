import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerPromotionDocument = BannerPromotion & Document;

export enum BannerPromotionStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DELETED = 'deleted',
  CANCELLED = 'cancelled',
}

export enum BannerPaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

@Schema({ timestamps: true })
export class BannerPromotion {
  @Prop({ required: true, unique: true, index: true })
  requestId: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true })
  merchantName: string;

  @Prop({ required: true })
  merchantEmail: string;

  @Prop({ required: true })
  bannerTitle: string;

  @Prop({ required: true })
  bannerCategory: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ default: '1920 x 520 px' })
  recommendedSize: string;

  @Prop({ type: [Date], required: true, default: [] })
  selectedDates: Date[];

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 1 })
  selectedDays: number;

  @Prop({ default: 240 })
  dailyRate: number;

  @Prop({ default: 49 })
  platformFee: number;

  @Prop({ required: true })
  totalPrice: number;

  @Prop({
    enum: BannerPromotionStatus,
    default: BannerPromotionStatus.UNDER_REVIEW,
    index: true,
  })
  status: BannerPromotionStatus;

  @Prop({ enum: BannerPaymentStatus, default: BannerPaymentStatus.PENDING })
  paymentStatus: BannerPaymentStatus;

  @Prop()
  adminNotes?: string;

  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  paymentReference?: string;

  @Prop({ default: false })
  isHomepageVisible: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const BannerPromotionSchema =
  SchemaFactory.createForClass(BannerPromotion);

BannerPromotionSchema.index({ merchantId: 1, createdAt: -1 });
BannerPromotionSchema.index({
  status: 1,
  paymentStatus: 1,
  startDate: 1,
  endDate: 1,
});

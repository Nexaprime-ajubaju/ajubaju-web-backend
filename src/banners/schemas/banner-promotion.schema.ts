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
}

export enum BannerPaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

export enum BannerPromotionType {
  BANNER = 'banner',
  OFFER = 'offer',
}

export enum BannerCoverageType {
  TOWN = 'Town',
  CITY = 'City',
  DISTRICT = 'District',
}

@Schema({ timestamps: true, collection: 'banner_promotions' })
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

  @Prop({ default: '' })
  description: string;

  @Prop({
    enum: BannerPromotionType,
    default: BannerPromotionType.BANNER,
    index: true,
  })
  promotionType: BannerPromotionType;

  @Prop({})
  imageUrl: string;

  @Prop({ default: '1920 x 520 px' })
  recommendedSize: string;

  @Prop({ enum: BannerCoverageType, required: false })
  coverageType: BannerCoverageType;

  @Prop({ required: false })
  coverageRegion: string;

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

  @Prop({ default: false })
  loyaltyRewardEnabled: boolean;

  @Prop({ default: 0 })
  loyaltyStarsToOffer: number;

  @Prop({ default: 1 })
  loyaltyStarsPerPurchase: number;

  @Prop({ default: 10 })
  loyaltyScorePerStar: number;

  @Prop({ default: '' })
  promotionExpiryText: string;

  @Prop({ default: '' })
  termsAndConditions: string;

  @Prop({ default: '' })
  exampleUsage: string;

  @Prop({ type: [String], default: [] })
  targetCities: string[];

  @Prop({
    type: [
      {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true },
      },
    ],
    default: [],
    index: '2dsphere',
  })
  targetLocations: { type: string; coordinates: number[] }[];

  @Prop({
    type: [
      {
        productId: { type: String, required: true },
        productName: { type: String, required: true },
        imageUrl: { type: String, default: '' },
        originalPrice: { type: Number, required: true, min: 0 },
        offerPrice: { type: Number, required: true, min: 0 },
        stockQuantity: { type: Number, default: 0, min: 0 },
      },
    ],
    default: [],
  })
  selectedProducts: Array<{
    productId: string;
    productName: string;
    imageUrl?: string;
    originalPrice: number;
    offerPrice: number;
    stockQuantity?: number;
  }>;

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
BannerPromotionSchema.index({ merchantId: 1, promotionType: 1, createdAt: -1 });
BannerPromotionSchema.index({
  status: 1,
  paymentStatus: 1,
  startDate: 1,
  endDate: 1,
});

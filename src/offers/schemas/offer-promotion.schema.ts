import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum OfferPromotionStatus {
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

export enum OfferPaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

export type OfferPromotionDocument = OfferPromotion & Document;

@Schema({ timestamps: true, collection: 'offers' })
export class OfferPromotion {
  @Prop({ required: true, unique: true, index: true })
  requestId: string;

  // Kept for compatibility with older deployments that still have a unique index on this field.
  @Prop({ default: null })
  idempotencyKey?: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true })
  merchantName: string;

  @Prop({ required: true })
  merchantEmail: string;

  @Prop({ required: true })
  title: string;

  // Business category (for matching user preferences) — auto-filled from merchant profile
  @Prop({ required: true })
  category: string;

  // Business-level category (copied from merchant's storeCategory) — used for recommendation matching
  @Prop({ default: '' })
  businessCategory?: string;

  // Business-level sub-category (copied from merchant's storeSubCategory)
  @Prop({ default: '' })
  businessSubCategory?: string;

  // The promotional type chosen by merchant (e.g., "Special", "Flash Sale") — for UI filtering
  @Prop({ default: '' })
  promoTag?: string;

  @Prop({ default: '' })
  description: string;

  @Prop({})
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

  @Prop({ default: false })
  loyaltyRewardEnabled: boolean;

  @Prop({ default: 0 })
  loyaltyStarsToOffer: number;

  @Prop({ default: 1 })
  loyaltyStarsPerPurchase: number;

    @Prop({ default: 10 }) 
  loyaltyScorePerStar: number;

    // New: Points per purchase set by merchant
    @Prop({ default: 0 })
    loyaltyPointsPerPurchase: number;

  @Prop({ default: '' })
  promotionExpiryText: string;

  @Prop({ default: '' })
  termsAndConditions: string;

  @Prop({ default: '' })
  exampleUsage: string;

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
  selectedProducts: Array<any>;

  @Prop({ enum: OfferPromotionStatus, default: OfferPromotionStatus.UNDER_REVIEW, index: true })
  status: OfferPromotionStatus;

  @Prop({ enum: OfferPaymentStatus, default: OfferPaymentStatus.PENDING })
  paymentStatus: OfferPaymentStatus;

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
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const OfferPromotionSchema = SchemaFactory.createForClass(OfferPromotion);
OfferPromotionSchema.index({ merchantId: 1, createdAt: -1 });

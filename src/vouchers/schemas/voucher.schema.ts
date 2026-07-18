import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VoucherDocument = Voucher & Document;

export enum VoucherStatus {
  ACTIVE = 'active',
  CLAIMED = 'claimed',
  REDEEMED = 'redeemed',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'vouchers' })
export class Voucher {
  @Prop({ required: true, index: true })
  userId: Types.ObjectId; // FK to User who claimed

  @Prop({ required: true, index: true })
  offerId: Types.ObjectId; // FK to Offer/Banner

  @Prop({ required: true, unique: true, index: true })
  voucherId: string; // Unique ID like "VOUCHER-1704067200000"

  @Prop({ required: true, unique: true, index: true })
  qrCode: string; // Actual QR code data to scan - "voucher-{voucherId}-{merchantId}"

  @Prop({ required: false })
  verificationCode?: string; // Manual verification code - "GKV8-5DKE-JVED"

  @Prop({ type: String, default: null })
  qrImage?: string;

  @Prop({ required: true, index: true })
  merchantId: Types.ObjectId; // FK to Merchant/User

  // Offer Details (denormalized for quick access without JOIN)
  @Prop({ required: true })
  offerTitle: string;

  @Prop({ required: true })
  merchantName: string;

  @Prop({ required: true })
  discount: string; // Can be "50%", "₹100", etc

  @Prop({ default: null })
  offerImage?: string;

  // Status & Validity
  @Prop({
    enum: VoucherStatus,
    default: VoucherStatus.ACTIVE,
    index: true,
  })
  status: VoucherStatus;

  @Prop({ type: Date, index: true })
  claimedAt: Date;

  @Prop({ default: '' })
  claimLocation?: string;

  @Prop({ type: Number, default: null })
  claimLatitude?: number;

  @Prop({ type: Number, default: null })
  claimLongitude?: number;

  @Prop({ type: Date })
  redeemedAt?: Date;

  @Prop({ type: Types.ObjectId })
  redeemedByMerchantId?: Types.ObjectId; // Which merchant redeemed it

  // Expiry
  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ default: 720 }) // 30 days
  validityHours: number;

  // Redemption Info
  @Prop({ unique: true, sparse: true })
  redemptionCode?: string; // Generated when redeemed - "RDM-1704153600000"

  @Prop({ type: String, default: null })
  shareEmail?: string; // Email voucher was shared with

  @Prop({ type: Date })
  sharedAt?: Date;

  // Timestamps automatically added by @Schema decorator
  // createdAt: Date;
  // updatedAt: Date;
}

export const VoucherSchema = SchemaFactory.createForClass(Voucher);

// Add compound indexes for common queries
VoucherSchema.index({ userId: 1, status: 1 });
VoucherSchema.index({ merchantId: 1, status: 1 });
VoucherSchema.index({ expiresAt: 1, status: 1 });
VoucherSchema.index({ qrCode: 1, status: 1 });
VoucherSchema.index(
  { userId: 1, offerId: 1 },
  {
    unique: true,
    name: 'user_offer_claim_unique',
  },
);
VoucherSchema.index(
  { verificationCode: 1 },
  {
    unique: true,
    name: 'verificationCode_1',
    partialFilterExpression: { verificationCode: { $type: 'string' } },
  },
);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MerchantDocument = Merchant & Document;

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Merchant {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true })
  storeName: string;

  @Prop({ required: true, trim: true, lowercase: true })
  storeEmail: string;

  @Prop()
  gstNumber?: string;

  @Prop()
  contactNumber?: string;

  @Prop()
  storeCategory?: string;

  @Prop()
  storeSubCategory?: string;

  @Prop({ enum: ['Merchant', 'Service Provider', 'Both'] })
  merchantRole?: string;

  @Prop()
  businessType?: string;

  @Prop()
  yearsInBusiness?: number;

  @Prop()
  businessDescription?: string;

  @Prop()
  storeLocation?: string;

  @Prop({ type: Number })
  storeLocationLatitude?: number;

  @Prop({ type: Number })
  storeLocationLongitude?: number;

  @Prop()
  profilePhoto?: string;

  @Prop()
  shopPhoto?: string;

  @Prop({ type: [String], default: [] })
  keywords?: string[];

  @Prop({ default: 'pending', enum: ['active', 'inactive', 'pending'] })
  status: 'active' | 'inactive' | 'pending';

  @Prop({ type: Object })
  documents?: {
    aadhaarUrl?: string;
    panUrl?: string;
    businessDocs?: Record<string, string>;
  };

  @Prop({ type: Object, default: null })
  offerTemplate?: any;

  @Prop({
    type: {
      emailNotifications: { type: Boolean, default: true },
      orderNotifications: { type: Boolean, default: true },
      promotionNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
    },
    default: {
      emailNotifications: true,
      orderNotifications: true,
      promotionNotifications: true,
      pushNotifications: true,
    },
  })
  notificationSettings?: {
    emailNotifications: boolean;
    orderNotifications: boolean;
    promotionNotifications: boolean;
    pushNotifications: boolean;
  };

  @Prop({ type: [String], default: [] })
  pushTokens?: string[];

  @Prop({
    type: {
      planId: { type: String, default: null }, // Reference to SubscriptionPlan unique name or ObjectId
      status: {
        type: String,
        enum: ['TRIAL', 'ACTIVE', 'EXPIRED'],
        default: 'TRIAL',
      },
      startedAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: null },
      trialEndsAt: { type: Date, default: null },
      billingCycle: {
        type: String,
        enum: ['monthly', 'yearly', 'lifetime'],
        default: 'monthly',
      },
      autoRenew: { type: Boolean, default: false },
      assignedBy: { type: String, default: 'system' },
      assignedAt: { type: Date, default: Date.now },
    },
    default: null,
  })
  subscription?: {
    planId: string;
    status: 'TRIAL' | 'ACTIVE' | 'EXPIRED';
    startedAt: Date;
    expiresAt: Date | null;
    trialEndsAt: Date | null;
    billingCycle: 'monthly' | 'yearly' | 'lifetime';
    autoRenew: boolean;
    assignedBy: string;
    assignedAt: Date;
  };

  @Prop({
    type: {
      contentUploadRestrictionUntil: { type: Date, default: null },
      riskScore: { type: Number, default: 0 },
      restrictionCount30Days: { type: Number, default: 0 },
      lastRestrictionAt: { type: Date, default: null },
    },
    default: {
      contentUploadRestrictionUntil: null,
      riskScore: 0,
      restrictionCount30Days: 0,
      lastRestrictionAt: null,
    },
  })
  security?: {
    contentUploadRestrictionUntil: Date | null;
    riskScore: number;
    restrictionCount30Days: number;
    lastRestrictionAt: Date | null;
  };

  @Prop({ type: Boolean, default: false })
  hasSelectedActiveProducts?: boolean;

  @Prop({ type: Number, default: 0 })
  walletBalance?: number;

  @Prop({ type: Number, default: 0 })
  profileViews?: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MerchantSchema = SchemaFactory.createForClass(Merchant);

MerchantSchema.index({ userId: 1 }, { unique: true });
MerchantSchema.index({ storeEmail: 1 });
// Indexes for category-level queries (used in nearby offers join + search)
MerchantSchema.index({ storeCategory: 1 });
MerchantSchema.index({ storeCategory: 1, storeSubCategory: 1 });
// Text index for fast full-text search (replaces regex collection scans)
MerchantSchema.index(
  {
    storeName: 'text',
    storeCategory: 'text',
    storeSubCategory: 'text',
    storeLocation: 'text',
  },
  {
    name: 'merchant_text_search',
    weights: {
      storeName: 10,
      storeCategory: 5,
      storeSubCategory: 3,
      storeLocation: 1,
    },
  },
);

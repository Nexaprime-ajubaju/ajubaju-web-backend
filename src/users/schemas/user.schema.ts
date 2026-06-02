import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  USER = 'customer',
  MERCHANT = 'merchant',
  ADMIN = 'admin'
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: [String], default: [] })
  passwordHistory: string[];

  // Total loyalty points earned by the user
  @Prop({ default: 0 })
  loyaltyPoints: number;

  // Per-merchant loyalty points: { merchantId: points }
  @Prop({ type: Object, default: {} })
  merchantLoyaltyPoints: { [merchantId: string]: number };

  @Prop({ required: true, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ enum: ['user', 'merchant'], default: 'user' })
  accountType: 'user' | 'merchant';

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: [String], default: [] })
  refreshTokens: string[];

  @Prop({
    type: {
      phone: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      avatar: String,
      bio: String,
      interests: [String]
    }
  })
  profile: {
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    avatar?: string;
    bio?: string;
    interests?: string[];
  };

  @Prop({ type: String })
  profilePhoto?: string;

  @Prop({ type: Object })
  metadata: {
    lastLoginAt?: Date;
    lastLoginIp?: string;
    registeredIp?: string;
  };

  @Prop()
  passwordChangeOTP?: string;

  @Prop()
  passwordChangeOTPExpiry?: Date;

  @Prop({ default: false })
  passwordChangeOTPVerified?: boolean;

  @Prop({ type: [String], default: [] })
  wishlist: string[];

  @Prop({ type: [String], default: [] })
  preferredCategories: string[];

  @Prop({
    type: {
      category: String,
      title: String,
      description: String,
      createdAt: Date,
      updatedAt: Date,
    },
    default: null,
  })
  iWantPreference?: {
    category?: string;
    title?: string;
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };


  @Prop({ default: false })
  isBanned: boolean;

  @Prop()
  banReason?: string;

  // Date until which the user is banned (null = permanent or not banned)
  @Prop()
  banUntil?: Date;

  @Prop({ enum: ['Pending', 'Verified', 'Rejected', 'Under Review'], default: 'Pending' })
  kycStatus?: string;

  @Prop()
  kycRejectionReason?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Create indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ preferredCategories: 1 });
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubscriptionPlanDocument = SubscriptionPlan & Document;

@Schema({ _id: false })
export class InventoryFeatures {
  @Prop({ required: true })
  maxProducts: number;
}

@Schema({ _id: false })
export class OffersFeatures {
  @Prop({ required: true })
  maxActive: number;

  @Prop({ required: true })
  maxDurationDays: number;
}

@Schema({ _id: false })
export class AnalyticsFeatures {
  @Prop({ required: true })
  basic: boolean;

  @Prop({ required: true })
  advanced: boolean;

  @Prop({ required: true })
  ageGender: boolean;

  @Prop({ required: true })
  location: boolean;

  @Prop({ required: true })
  device: boolean;

  @Prop({ required: true })
  revenue: boolean;

  @Prop({ required: true })
  graphs: boolean;
}

@Schema({ _id: false })
export class BannerFeatures {
  @Prop({ required: true })
  monthlyCredits: number;

  @Prop({ required: true })
  payAsYouGo: boolean;
}

@Schema({ _id: false })
export class SearchFeatures {
  @Prop({ required: true })
  priority: boolean;
}

@Schema({ _id: false })
export class WebsiteFeatures {
  @Prop({ required: true })
  enabled: boolean;
}

@Schema({ _id: false })
export class PlanFeatures {
  @Prop({ type: InventoryFeatures, required: true })
  inventory: InventoryFeatures;

  @Prop({ type: OffersFeatures, required: true })
  offers: OffersFeatures;

  @Prop({ type: AnalyticsFeatures, required: true })
  analytics: AnalyticsFeatures;

  @Prop({ type: BannerFeatures, required: true })
  banner: BannerFeatures;

  @Prop({ type: SearchFeatures, required: true })
  search: SearchFeatures;

  @Prop({ type: WebsiteFeatures, required: true })
  website: WebsiteFeatures;
}

@Schema({ timestamps: true, optimisticConcurrency: true })
export class SubscriptionPlan {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, default: false })
  isSystem: boolean;

  @Prop({ required: true, default: 0 })
  price: number;

  @Prop({ type: PlanFeatures, required: true })
  features: PlanFeatures;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SubscriptionPlanSchema = SchemaFactory.createForClass(SubscriptionPlan);

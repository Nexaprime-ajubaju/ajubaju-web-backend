import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from './schemas/subscription-plan.schema';

@Injectable()
export class SubscriptionSeed implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionSeed.name);

  constructor(
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
  ) {}

  async onModuleInit() {
    await this.seedPlans();
  }

  private async seedPlans() {
    const plans = [
      {
        name: 'Free Tier',
        description: 'Basic entry plan for merchants',
        isSystem: true,
        features: {
          inventory: { maxProducts: 5 },
          offers: { maxActive: 2, maxDurationDays: 5 },
          analytics: {
            basic: true,
            advanced: false,
            ageGender: false,
            location: false,
            device: false,
            revenue: false,
            graphs: false,
          },
          banner: { monthlyCredits: 0, payAsYouGo: true },
          search: { priority: false },
          website: { enabled: false },
        },
      },
      {
        name: 'Starter',
        description: 'For growing businesses',
        isSystem: true,
        features: {
          inventory: { maxProducts: 30 },
          offers: { maxActive: 5, maxDurationDays: 15 },
          analytics: {
            basic: true,
            advanced: false,
            ageGender: false,
            location: false,
            device: false,
            revenue: false,
            graphs: false,
          },
          banner: { monthlyCredits: 0, payAsYouGo: true },
          search: { priority: false },
          website: { enabled: false },
        },
      },
      {
        name: 'Pro',
        description: 'Professional suite with advanced analytics',
        isSystem: true,
        features: {
          inventory: { maxProducts: 100 },
          offers: { maxActive: 20, maxDurationDays: 30 },
          analytics: {
            basic: true,
            advanced: true,
            ageGender: true,
            location: true,
            device: true,
            revenue: true,
            graphs: true,
          },
          banner: { monthlyCredits: 1, payAsYouGo: false },
          search: { priority: true },
          website: { enabled: false },
        },
      },
      {
        name: 'Premium',
        description: 'Unlimited access and priority support',
        isSystem: true,
        features: {
          inventory: { maxProducts: -1 }, // -1 means unlimited
          offers: { maxActive: -1, maxDurationDays: 60 }, // -1 means unlimited active offers
          analytics: {
            basic: true,
            advanced: true,
            ageGender: true,
            location: true,
            device: true,
            revenue: true,
            graphs: true,
          },
          banner: { monthlyCredits: 2, payAsYouGo: false },
          search: { priority: true },
          website: { enabled: true },
        },
      },
    ];

    for (const planData of plans) {
      const existing = await this.planModel
        .findOne({ name: planData.name })
        .exec();
      if (!existing) {
        await this.planModel.create(planData);
        this.logger.log(`Seeded Subscription Plan: ${planData.name}`);
      }
    }
  }
}

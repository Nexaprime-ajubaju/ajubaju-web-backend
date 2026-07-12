import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubscriptionPlan, SubscriptionPlanDocument } from './schemas/subscription-plan.schema';
import { MerchantSubscriptionHistory, MerchantSubscriptionHistoryDocument } from './schemas/merchant-subscription-history.schema';
import { MerchantBannerCredits, MerchantBannerCreditsDocument } from './schemas/merchant-banner-credits.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import * as moment from 'moment';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(SubscriptionPlan.name) private readonly subscriptionPlanModel: Model<SubscriptionPlanDocument>,
    @InjectModel(MerchantSubscriptionHistory.name) private readonly historyModel: Model<MerchantSubscriptionHistoryDocument>,
    @InjectModel(MerchantBannerCredits.name) private readonly bannerCreditsModel: Model<MerchantBannerCreditsDocument>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<MerchantDocument>,
  ) {}

  /**
   * Retrieves the active subscription plan for a given merchant.
   * Resolves trial expirations dynamically to fall back to 'Free Tier'.
   */
  async getActivePlan(merchantId: string): Promise<SubscriptionPlanDocument> {
    const merchant = await this.merchantModel.findOne({ userId: merchantId }).exec();
    if (!merchant) throw new NotFoundException('Merchant not found');

    if (!merchant.subscription || !merchant.subscription.planId) {
      // Fallback if somehow missing
      return this.subscriptionPlanModel.findOne({ name: 'Free Tier' }).exec();
    }

    let planId = merchant.subscription.planId;
    
    // Resolve Trial Expiry
    if (merchant.subscription.status === 'TRIAL' && merchant.subscription.trialEndsAt) {
      if (moment().isAfter(moment(merchant.subscription.trialEndsAt))) {
        // Trial expired, fallback to Free Tier
        const freeTier = await this.subscriptionPlanModel.findOne({ name: 'Free Tier' }).exec();
        if (freeTier) {
          planId = (freeTier as any).name; // Or ObjectId based on how it's stored. If string:
          
          // Let's assume planId stores the plan name for simplicity, or we query by name if it fails.
          // In the schema, planId is a string, so we can use the unique name.
          merchant.subscription.planId = planId;
          merchant.subscription.status = 'ACTIVE';
          await merchant.save();
        }
      }
    }

    // Resolve plan by planId (which we will assume is the unique `name` string for easy readability)
    let plan = await this.subscriptionPlanModel.findOne({ name: planId }).exec();
    if (!plan) {
      // Fallback
      plan = await this.subscriptionPlanModel.findOne({ name: 'Free Tier' }).exec();
    }

    return plan;
  }

  async getAllPublicPlans() {
    const plans = await this.subscriptionPlanModel.find({ isActive: true }).sort({ price: 1 }).lean().exec();
    
    return plans.map(plan => {
      const displayFeatures = [];
      const f = plan.features as any;
      
      if (f.inventory?.maxProducts === -1) {
        displayFeatures.push("Unlimited active products");
      } else if (f.inventory?.maxProducts) {
        displayFeatures.push(`Up to ${f.inventory.maxProducts} active products`);
      }

      if (f.offers?.maxActive === -1) {
        displayFeatures.push("Unlimited active offers");
      } else if (f.offers?.maxActive) {
        displayFeatures.push(`Up to ${f.offers.maxActive} active offers`);
      }

      if (f.offers?.maxDurationDays) {
        displayFeatures.push(`Offer duration up to ${f.offers.maxDurationDays} days`);
      }

      if (f.analytics?.advanced) {
        displayFeatures.push("Advanced business analytics");
      } else if (f.analytics?.basic) {
        displayFeatures.push("Basic analytics dashboard");
      }

      if (f.support?.level) {
        displayFeatures.push(`${f.support.level} customer support`);
      }

      if (f.promotions?.bannersPerMonth === -1) {
        displayFeatures.push("Unlimited banner promotions");
      } else if (f.promotions?.bannersPerMonth > 0) {
        displayFeatures.push(`${f.promotions.bannersPerMonth} banner promotions/month`);
      }

      if (f.loyalty?.enabled) {
        displayFeatures.push(f.loyalty.customRewards ? "Advanced custom loyalty program" : "Basic loyalty points system");
      }

      if (f.locations?.max === -1) {
        displayFeatures.push("Unlimited locations support");
      } else if (f.locations?.max > 1) {
        displayFeatures.push(`Up to ${f.locations.max} store locations`);
      }

      if (f.website?.enabled) {
        displayFeatures.push("Mini website enabled");
      }

      return {
        id: plan.name.toLowerCase().replace(/\s+/g, '-'),
        name: plan.name,
        price: plan.price || 0,
        description: plan.description || "Start scaling your business",
        isPopular: plan.name.toLowerCase().includes('pro'),
        displayFeatures
      };
    });
  }

  async calculateInitialTrialDates() {
    const trialStartDate = new Date();
    const trialEndDate = moment(trialStartDate).add(50, 'days').toDate();
    return { trialStartDate, trialEndDate };
  }

  async ensureTrialEndDate(merchant: MerchantDocument) {
    if (!merchant.subscription?.trialEndsAt) {
      if (!merchant.subscription) {
        merchant.subscription = {
          planId: 'Premium',
          status: 'TRIAL',
          startedAt: new Date(),
          expiresAt: null,
          trialEndsAt: moment(merchant.createdAt || Date.now()).add(50, 'days').toDate(),
          billingCycle: 'monthly',
          autoRenew: false,
          assignedBy: 'system',
          assignedAt: new Date()
        };
      } else {
        merchant.subscription.trialEndsAt = moment(merchant.createdAt || Date.now()).add(50, 'days').toDate();
      }
      await merchant.save();
    }
    return merchant;
  }

  // --- BACKWARD COMPATIBILITY ---
  
  async getPlanDetails(merchantOrDoc: MerchantDocument, session?: any) {
    const merchantId = merchantOrDoc.userId;
    const plan = await this.getActivePlan(merchantId);
    
    // Convert new granular features to legacy PlanFeatures for compatibility
    const planFeatures = {
      canAddProduct: true,
      canDeleteProduct: plan.name !== 'Free Tier', // Free tier couldn't delete in old logic
      canExportCsv: plan.features.analytics.advanced, // Close approximation
      canViewAdvancedAnalytics: plan.features.analytics.advanced,
      canCreateOffer: true,
      canEditOffer: plan.name !== 'Free Tier', // Free tier couldn't edit
      canDeleteOffer: plan.name !== 'Free Tier', // Free tier couldn't delete
      canViewOfferDetails: plan.name !== 'Free Tier',
      maxProducts: plan.features.inventory.maxProducts,
      maxMonthlyOffers: plan.features.offers.maxActive,
      maxOfferDurationDays: plan.features.offers.maxDurationDays,
      ordersStatusAllowed: plan.name === 'Free Tier' 
        ? ['Completed'] 
        : ['Pending', 'Processing', 'Ready for Delivery', 'On the way', 'Delivered', 'Cancelled', 'Completed']
    };

    let trialRemainingDays = 0;
    let freeTierMonthsElapsed = 0;
    const now = moment();
    
    if (merchantOrDoc.subscription?.status === 'TRIAL' && merchantOrDoc.subscription?.trialEndsAt) {
      trialRemainingDays = Math.max(0, moment(merchantOrDoc.subscription.trialEndsAt).diff(now, 'days'));
    } else if (merchantOrDoc.subscription?.startedAt && plan.name === 'Free Tier') {
      freeTierMonthsElapsed = Math.max(0, Math.floor(now.diff(moment(merchantOrDoc.subscription.startedAt), 'months', true)));
    }

    return {
      planType: plan.name, // Will be returned as 'Free Tier', 'Starter', etc.
      name: plan.name,
      status: merchantOrDoc.subscription?.status || 'ACTIVE',
      trialRemainingDays,
      freeTierMonthsElapsed,
      expiresAt: merchantOrDoc.subscription?.expiresAt || null,
      planFeatures,
      usage: {
        products: 0, // This was fetched using merchantProductModel.countDocuments in old logic. We can leave it 0 or mock it if UI relies heavily on it. 
        monthlyOffers: 0, 
      },
      upgradeAvailable: plan.name !== 'Premium',
    };
  }

  // --- FEATURE GUARDS ---

  async canCreateProduct(merchantId: string, currentProductCount: number): Promise<boolean> {
    const plan = await this.getActivePlan(merchantId);
    if (!plan) return false;
    if (plan.features.inventory.maxProducts === -1) return true; // Unlimited
    return currentProductCount < plan.features.inventory.maxProducts;
  }

  async canCreateOffer(merchantId: string, currentMonthlyOfferCount: number): Promise<boolean> {
    const plan = await this.getActivePlan(merchantId);
    if (!plan) return false;
    if (plan.features.offers.maxActive === -1) return true; // Unlimited
    return currentMonthlyOfferCount < plan.features.offers.maxActive;
  }

  async getMaxOfferDuration(merchantId: string): Promise<number> {
    const plan = await this.getActivePlan(merchantId);
    if (!plan) return 0;
    return plan.features.offers.maxDurationDays;
  }

  async getAnalyticsPermissions(merchantId: string) {
    const plan = await this.getActivePlan(merchantId);
    if (!plan) return null;
    return plan.features.analytics;
  }

  async subscribeToPlan(merchantId: string, planName: string, billingCycle: 'monthly' | 'yearly') {
    const merchant = await this.merchantModel.findOne({ userId: merchantId }).exec();
    if (!merchant) throw new NotFoundException('Merchant not found');

    const plan = await this.subscriptionPlanModel.findOne({ name: planName, isActive: true }).exec();
    if (!plan) throw new NotFoundException('Plan not found or not active');

    const startedAt = new Date();
    const expiresAt = moment(startedAt).add(1, billingCycle === 'yearly' ? 'year' : 'month').toDate();

    merchant.subscription = {
      planId: planName,
      status: 'ACTIVE',
      startedAt,
      expiresAt,
      trialEndsAt: merchant.subscription?.trialEndsAt || null,
      billingCycle,
      autoRenew: true,
      assignedBy: 'merchant_self',
      assignedAt: new Date()
    };

    await merchant.save();
    return { success: true, plan: planName, expiresAt };
  }
}

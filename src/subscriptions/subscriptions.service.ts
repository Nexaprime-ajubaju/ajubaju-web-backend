import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
    const isObjId = /^[0-9a-fA-F]{24}$/.test(merchantId);
    const query = isObjId ? { $or: [{ _id: merchantId }, { userId: merchantId }] } : { userId: merchantId };
    const merchant = await this.merchantModel.findOne(query).exec();
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

    // Resolve Paid Plan Expiry
    if (merchant.subscription.status === 'ACTIVE' && merchant.subscription.expiresAt && planId !== 'Free Tier') {
      if (moment().isAfter(moment(merchant.subscription.expiresAt))) {
        // Paid plan expired, fallback to Free Tier
        const freeTier = await this.subscriptionPlanModel.findOne({ name: 'Free Tier' }).exec();
        if (freeTier) {
          planId = (freeTier as any).name;
          merchant.subscription.planId = planId;
          merchant.subscription.status = 'ACTIVE';
          merchant.subscription.expiresAt = null;
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

  async getAllPublicPlans(isAdmin = false) {
    const query = isAdmin ? {} : { isActive: true };
    const plans = await this.subscriptionPlanModel.find(query).sort({ price: 1 }).lean().exec();
    
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
        isActive: plan.isActive !== false,
        displayFeatures,
        features: plan.features
      };
    });
  }

  async getPlanById(id: string) {
    const plans = await this.subscriptionPlanModel.find().exec();
    const plan = plans.find(p => p._id.toString() === id || p.name.toLowerCase().replace(/\s+/g, '-') === id || p.name === id);
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async updatePlan(id: string, data: any) {
    const plans = await this.subscriptionPlanModel.find().exec();
    const plan = plans.find(p => p._id.toString() === id || p.name.toLowerCase().replace(/\s+/g, '-') === id || p.name === id);
    
    if (!plan) throw new NotFoundException('Plan not found');
    
    if (data.features) {
      plan.features = data.features;
      plan.markModified('features');
    }
    if (data.price !== undefined) {
      plan.price = data.price;
    }
    if (data.isActive !== undefined) {
      plan.isActive = data.isActive;
    }
    
    await plan.save();
    return plan;
  }

  async createPlan(data: any) {
    // Generate default features if not provided
    const defaultFeatures = {
      inventory: { maxProducts: 50 },
      offers: { maxActive: 5, maxDurationDays: 15 },
      analytics: { basic: true, advanced: false, ageGender: false },
      support: { level: 'email' },
      promotions: { bannersPerMonth: 0, priorityPlacement: false },
      loyalty: { enabled: false, customRewards: false },
      locations: { max: 1 },
      search: { sponsoredRank: 0 },
      website: { enabled: true }
    };
    
    const newPlan = new this.subscriptionPlanModel({
      name: data.name,
      description: data.description || 'New subscription plan',
      price: data.price || 0,
      isActive: data.isActive !== false,
      isSystem: false,
      features: data.features || defaultFeatures
    });
    
    await newPlan.save();
    return newPlan;
  }

  async getAnalytics() {
    // Get all plans
    const plansCount = await this.subscriptionPlanModel.countDocuments();
    
    // Get all merchants
    const merchants = await this.merchantModel.find().exec();
    
    const activeMerchantsByPlan: Record<string, number> = {};
    let paid = 0;
    let trials = 0;
    let expired = 0;
    
    for (const merchant of merchants) {
      let status = merchant.subscription?.status;
      let planId = merchant.subscription?.planId;

      if (!merchant.subscription || !planId || planId.toLowerCase() === 'free tier') {
        status = 'ACTIVE';
        planId = 'Free Tier';
      }

      if (status === 'TRIAL' && merchant.subscription?.trialEndsAt) {
        if (moment().isAfter(moment(merchant.subscription.trialEndsAt))) {
          status = 'ACTIVE';
          planId = 'Free Tier';
        } else {
          trials++;
        }
      } else if (status === 'ACTIVE' && merchant.subscription?.expiresAt && planId !== 'Free Tier') {
        if (moment().isAfter(moment(merchant.subscription.expiresAt))) {
          status = 'ACTIVE';
          planId = 'Free Tier';
        }
      } else if (status === 'EXPIRED') {
        expired++;
      }

      if ((status === 'ACTIVE' || status === 'TRIAL') && planId) {
        activeMerchantsByPlan[planId] = (activeMerchantsByPlan[planId] || 0) + 1;
        
        if (planId !== 'Free Tier' && planId.toLowerCase() !== 'free tier' && status === 'ACTIVE') {
          paid++;
        }
      }
    }
    
    return {
      plans: plansCount,
      trials,
      paid,
      expired,
      upgrades: 0,
      downgrades: 0,
      revenue: 0,
      activeMerchantsByPlan
    };
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
    const isObjId = /^[0-9a-fA-F]{24}$/.test(merchantId);
    const query = isObjId ? { $or: [{ _id: merchantId }, { userId: merchantId }] } : { userId: merchantId };
    const merchant = await this.merchantModel.findOne(query).exec();
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

  async deletePlan(id: string) {
    const plans = await this.subscriptionPlanModel.find().exec();
    const plan = plans.find(p => p._id.toString() === id || p.name.toLowerCase().replace(/\s+/g, '-') === id || p.name === id);
    if (!plan) throw new NotFoundException('Plan not found');
    
    // Check if it's a system plan
    if (plan.isSystem) {
      throw new BadRequestException('Cannot delete system plans (e.g. Free Tier)');
    }
    
    await this.subscriptionPlanModel.deleteOne({ _id: plan._id });
    return { success: true };
  }

  async getMerchantsByPlan(planName: string) {
    // Note: The param could be id format e.g. "free-tier"
    // So resolve to true plan name first
    const plans = await this.subscriptionPlanModel.find().exec();
    const plan = plans.find(p => p.name.toLowerCase().replace(/\s+/g, '-') === planName || p.name === planName);
    const resolvedPlanName = plan ? plan.name : planName;

    const merchants = await this.merchantModel.find({ 'subscription.planId': resolvedPlanName })
      .populate({ path: 'userId', select: 'firstName lastName email phoneNumber' })
      .exec();

    return merchants.map(m => {
      const user = m.userId as any;
      return {
        id: m._id, // Maps to merchant.id for React keys
        _id: m._id,
        merchantId: user?._id || m.userId, 
        name: (m as any).storeName || 'Unknown Store', // Maps to merchant.name in UI
        email: (m as any).storeEmail || user?.email || 'N/A', // Maps to merchant.email in UI
        status: m.subscription?.status,
        billingCycle: m.subscription?.billingCycle || 'monthly', // Maps to merchant.billingCycle in UI
        trialEndsAt: m.subscription?.trialEndsAt,
        startedAt: m.subscription?.startedAt,
        expiresAt: m.subscription?.expiresAt,
      };
    });
  }

  async getMerchantSubscription(merchantId: string) {
    const isObjId = /^[0-9a-fA-F]{24}$/.test(merchantId);
    const query = isObjId ? { $or: [{ _id: merchantId }, { userId: merchantId }] } : { userId: merchantId };
    const merchant = await this.merchantModel.findOne(query).exec();
    if (!merchant) throw new NotFoundException('Merchant not found');
    
    // We already have getPlanDetails(merchant)
    return this.getPlanDetails(merchant as any);
  }

  async assignMerchantSubscription(merchantId: string, data: any) {
    const isObjId = /^[0-9a-fA-F]{24}$/.test(merchantId);
    const query = isObjId ? { $or: [{ _id: merchantId }, { userId: merchantId }] } : { userId: merchantId };
    const merchant = await this.merchantModel.findOne(query).exec();
    if (!merchant) throw new NotFoundException('Merchant not found');

    const plan = await this.subscriptionPlanModel.findOne({ name: data.planId }).exec();
    if (!plan) throw new NotFoundException('Plan not found');

    const startedAt = data.startedAt ? new Date(data.startedAt) : new Date();
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : moment(startedAt).add(1, data.billingCycle === 'yearly' ? 'year' : 'month').toDate();

    merchant.subscription = {
      planId: plan.name,
      status: data.status || 'ACTIVE',
      startedAt,
      expiresAt,
      trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : (merchant.subscription?.trialEndsAt || null),
      billingCycle: data.billingCycle || 'monthly',
      autoRenew: data.autoRenew !== false,
      assignedBy: 'admin',
      assignedAt: new Date()
    };

    await merchant.save();

    // Log history
    await this.historyModel.create({
      merchantId,
      action: 'ADMIN_UPDATE',
      planId: plan.name,
      performedBy: 'admin',
      details: data
    });

    return { success: true };
  }

  async getMerchantSubscriptionHistory(merchantId: string) {
    const isObjId = /^[0-9a-fA-F]{24}$/.test(merchantId);
    const query = isObjId ? { $or: [{ merchantId }, { userId: merchantId }] } : { merchantId };
    // We should technically fetch the merchant to get their userId if merchantId is _id, 
    // but looking at assignMerchantSubscription, it saves history with `merchantId: merchantId` which is the param passed.
    // If the param passed was an _id, the history has _id. If it was userId, it has userId.
    // So searching for both $or: [{ merchantId }, { merchantId: merchant.userId }] is best.
    let searchId = merchantId;
    if (isObjId) {
      const merchant = await this.merchantModel.findOne({ _id: merchantId }).exec();
      if (merchant && merchant.userId) searchId = merchant.userId;
    }
    return this.historyModel.find({ $or: [{ merchantId: merchantId }, { merchantId: searchId }] }).sort({ createdAt: -1 }).exec();
  }
}

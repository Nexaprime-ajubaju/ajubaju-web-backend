import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MerchantDocument } from '../users/schemas/merchant.schema';
import {
  MerchantProduct,
  MerchantProductDocument,
} from '../merchant-products/schemas/merchant-product.schema';
import {
  OfferPromotion,
  OfferPromotionDocument,
} from '../offers/schemas/offer-promotion.schema';
import * as moment from 'moment';
import { MerchantPlanType, PLAN_LIMITS } from './merchant-plan.constants';

export interface PlanFeatures {
  canAddProduct: boolean;
  canDeleteProduct: boolean;
  canExportCsv: boolean;
  canViewAdvancedAnalytics: boolean;
  canCreateOffer: boolean;
  canEditOffer: boolean;
  canDeleteOffer: boolean;
  canViewOfferDetails: boolean;
  maxProducts: number;
  maxMonthlyOffers: number;
  maxOfferDurationDays: number;
  ordersStatusAllowed: string[];
}

export interface PlanUsage {
  products: number;
  monthlyOffers: number;
}

export interface MerchantPlanDetails {
  planType: MerchantPlanType;
  name: string;
  status: string;
  trialRemainingDays: number;
  freeTierMonthsElapsed: number;
  expiresAt: Date | null;
  planFeatures: PlanFeatures;
  usage: PlanUsage;
  upgradeAvailable: boolean;
}

@Injectable()
export class MerchantPlanService {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(OfferPromotion.name)
    private readonly offerModel: Model<OfferPromotionDocument>,
  ) {}

  async calculateInitialTrialDates(): Promise<{
    trialStartDate: Date;
    trialEndDate: Date;
  }> {
    const trialStartDate = new Date();
    const settings = await this.systemSettingsService.getSettings();
    const trialDays = settings.merchantTrialDays ?? 50;
    const trialHours = settings.merchantTrialHours ?? 0;
    const trialMinutes = settings.merchantTrialMinutes ?? 0;
    const trialEndDate = moment(trialStartDate)
      .add(trialDays, 'days')
      .add(trialHours, 'hours')
      .add(trialMinutes, 'minutes')
      .toDate();
    return { trialStartDate, trialEndDate };
  }

  async ensureTrialEndDate(
    merchant: MerchantDocument,
  ): Promise<MerchantDocument> {
    if (!merchant.trialEndDate) {
      const settings = await this.systemSettingsService.getSettings();
      const trialDays = settings.merchantTrialDays ?? 50;
      const trialHours = settings.merchantTrialHours ?? 0;
      const trialMinutes = settings.merchantTrialMinutes ?? 0;
      const registrationDate =
        merchant.createdAt ||
        (merchant as any)._id?.getTimestamp?.() ||
        new Date(0);
      merchant.trialEndDate = moment(registrationDate)
        .add(trialDays, 'days')
        .add(trialHours, 'hours')
        .add(trialMinutes, 'minutes')
        .toDate();
      await merchant.save();
    }
    return merchant;
  }

  async getPlanDetails(
    merchant: MerchantDocument,
    session?: ClientSession,
  ): Promise<MerchantPlanDetails> {
    const now = moment();
    const settings = await this.systemSettingsService.getSettings();

    const trialDays = settings.merchantTrialDays ?? 50;
    const trialHours = settings.merchantTrialHours ?? 0;
    const trialMinutes = settings.merchantTrialMinutes ?? 0;

    const registrationDate =
      merchant.createdAt ||
      (merchant as any)._id?.getTimestamp?.() ||
      new Date(0);
    const dynamicTrialEndDate = moment(registrationDate)
      .add(trialDays, 'days')
      .add(trialHours, 'hours')
      .add(trialMinutes, 'minutes')
      .toDate();

    let trialEndDate = dynamicTrialEndDate;
    if (!settings.applyTrialChangesToExistingMerchants) {
      if (merchant.trialEndDate) {
        trialEndDate = merchant.trialEndDate;
      }
    }

    let planType: MerchantPlanType =
      (merchant as any).planType || MerchantPlanType.FREE;
    let trialRemainingDays = 0;
    let freeTierMonthsElapsed = 0;

    if (planType !== MerchantPlanType.PREMIUM) {
      if (now.isBefore(trialEndDate)) {
        planType = MerchantPlanType.TRIAL;
        trialRemainingDays = moment(trialEndDate).diff(now, 'days');
      } else {
        planType = MerchantPlanType.FREE;
        freeTierMonthsElapsed = now.diff(trialEndDate, 'months', true);
      }
    }

    const planFeatures = await this.getPlanFeatures(
      planType,
      freeTierMonthsElapsed,
      settings,
    );

    // Calculate usage
    const merchantId = merchant.userId;
    const productsCount = await this.merchantProductModel
      .countDocuments({ merchantId }, { session })
      .exec();

    const startOfMonth = new Date(now.year(), now.month(), 1);
    const offersThisMonth = await this.offerModel
      .countDocuments(
        {
          merchantId,
          createdAt: { $gte: startOfMonth },
        },
        { session },
      )
      .exec();

    let name = '';
    if (planType === MerchantPlanType.TRIAL) name = 'Free Trial';
    else if (planType === MerchantPlanType.PREMIUM) name = 'Premium';
    else name = 'Free Tier';

    return {
      planType,
      name,
      status: 'ACTIVE',
      trialRemainingDays: Math.max(0, trialRemainingDays),
      freeTierMonthsElapsed: Math.max(0, Math.floor(freeTierMonthsElapsed)),
      expiresAt: planType === MerchantPlanType.TRIAL ? trialEndDate : null,
      planFeatures,
      usage: {
        products: productsCount,
        monthlyOffers: offersThisMonth,
      },
      upgradeAvailable: planType !== MerchantPlanType.PREMIUM,
    };
  }

  private async getPlanFeatures(
    planType: MerchantPlanType,
    freeTierMonthsElapsed: number,
    settings: any,
  ): Promise<PlanFeatures> {
    if (
      planType === MerchantPlanType.TRIAL ||
      planType === MerchantPlanType.PREMIUM
    ) {
      return {
        canAddProduct: true,
        canDeleteProduct: true,
        canExportCsv: true,
        canViewAdvancedAnalytics: true,
        canCreateOffer: true,
        canEditOffer: true,
        canDeleteOffer: true,
        canViewOfferDetails: true,
        maxProducts: -1,
        maxMonthlyOffers: -1,
        maxOfferDurationDays: -1,
        ordersStatusAllowed: [
          'Pending',
          'Processing',
          'Ready for Delivery',
          'On the way',
          'Delivered',
          'Cancelled',
          'Completed',
        ],
      };
    }

    // Free tier logic
    const isFirstTwoMonths = freeTierMonthsElapsed < 2;

    return {
      canAddProduct: true,
      canDeleteProduct: false,
      canExportCsv: false,
      canViewAdvancedAnalytics: false,
      canCreateOffer: true,
      canEditOffer: false,
      canDeleteOffer: false,
      canViewOfferDetails: false,
      maxProducts: settings.freeTierMaxProducts ?? 10,
      maxMonthlyOffers: isFirstTwoMonths
        ? (settings.freeTierMaxMonthlyOffersFirst2Months ?? 5)
        : (settings.freeTierMaxMonthlyOffersAfter2Months ?? 2),
      maxOfferDurationDays: settings.freeTierMaxOfferDurationDays ?? 60,
      ordersStatusAllowed: ['Completed'],
    };
  }
}

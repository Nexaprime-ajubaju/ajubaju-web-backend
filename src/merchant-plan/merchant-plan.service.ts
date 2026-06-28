import { Injectable } from '@nestjs/common';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MerchantDocument } from '../users/schemas/merchant.schema';
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

export interface MerchantPlanDetails {
  planType: MerchantPlanType;
  trialRemainingDays: number;
  freeTierMonthsElapsed: number;
  planFeatures: PlanFeatures;
}

@Injectable()
export class MerchantPlanService {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  async calculateInitialTrialDates(): Promise<{ trialStartDate: Date; trialEndDate: Date }> {
    const trialStartDate = new Date();
    const settings = await this.systemSettingsService.getSettings();
    const trialDays = settings.merchantTrialDays || 50;
    const trialHours = settings.merchantTrialHours || 0;
    const trialMinutes = settings.merchantTrialMinutes || 0;
    const trialEndDate = moment(trialStartDate).add(trialDays, 'days').add(trialHours, 'hours').add(trialMinutes, 'minutes').toDate();
    return { trialStartDate, trialEndDate };
  }

  async ensureTrialEndDate(merchant: MerchantDocument): Promise<MerchantDocument> {
    if (!merchant.trialEndDate) {
      const settings = await this.systemSettingsService.getSettings();
      const trialDays = settings.merchantTrialDays || 50;
      const trialHours = settings.merchantTrialHours || 0;
      const trialMinutes = settings.merchantTrialMinutes || 0;
      merchant.trialEndDate = moment(merchant.createdAt).add(trialDays, 'days').add(trialHours, 'hours').add(trialMinutes, 'minutes').toDate();
      await merchant.save();
    }
    return merchant;
  }

  async getPlanDetails(merchant: MerchantDocument): Promise<MerchantPlanDetails> {
    const now = moment();
    const settings = await this.systemSettingsService.getSettings();
    
    const trialDays = settings.merchantTrialDays || 50;
    const trialHours = settings.merchantTrialHours || 0;
    const trialMinutes = settings.merchantTrialMinutes || 0;
    const trialEndDate = merchant.trialEndDate || moment(merchant.createdAt).add(trialDays, 'days').add(trialHours, 'hours').add(trialMinutes, 'minutes').toDate();
    
    let planType: MerchantPlanType = MerchantPlanType.FREE;
    let trialRemainingDays = 0;
    let freeTierMonthsElapsed = 0;

    if (now.isBefore(trialEndDate)) {
      planType = MerchantPlanType.TRIAL;
      trialRemainingDays = moment(trialEndDate).diff(now, 'days');
    } else {
      planType = MerchantPlanType.FREE;
      freeTierMonthsElapsed = now.diff(trialEndDate, 'months', true);
    }

    const planFeatures = await this.getPlanFeatures(planType, freeTierMonthsElapsed, settings);

    return {
      planType,
      trialRemainingDays: Math.max(0, trialRemainingDays),
      freeTierMonthsElapsed: Math.max(0, Math.floor(freeTierMonthsElapsed)),
      planFeatures,
    };
  }

  private async getPlanFeatures(planType: MerchantPlanType, freeTierMonthsElapsed: number, settings: any): Promise<PlanFeatures> {
    if (planType === MerchantPlanType.TRIAL || planType === MerchantPlanType.PREMIUM) {
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
        ordersStatusAllowed: ['Pending', 'Processing', 'Ready for Delivery', 'On the way', 'Delivered', 'Cancelled', 'Completed'],
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
      maxMonthlyOffers: isFirstTwoMonths ? (settings.freeTierMaxMonthlyOffersFirst2Months ?? 5) : (settings.freeTierMaxMonthlyOffersAfter2Months ?? 2),
      maxOfferDurationDays: settings.freeTierMaxOfferDurationDays ?? 60,
      ordersStatusAllowed: ['Completed'],
    };
  }
}


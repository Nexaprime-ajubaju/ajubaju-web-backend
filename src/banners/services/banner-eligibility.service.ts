import { Injectable, Logger } from '@nestjs/common';
import {
  BannerPromotion,
  BannerPromotionStatus,
  BannerPromotionType,
} from '../schemas/banner-promotion.schema';

@Injectable()
export class BannerEligibilityService {
  private readonly logger = new Logger(BannerEligibilityService.name);

  /**
   * Pipeline check to verify if a banner campaign is eligible for display in a given city
   */
  isEligibleForCity(campaign: BannerPromotion, city: string, now: Date = new Date()): boolean {
    if (!campaign) return false;

    // 1. Status check (APPROVED or ACTIVE)
    const validStatuses = [BannerPromotionStatus.APPROVED, BannerPromotionStatus.ACTIVE];
    if (!validStatuses.includes(campaign.status)) {
      return false;
    }

    // 2. Type check
    if (campaign.promotionType && campaign.promotionType !== BannerPromotionType.BANNER) {
      return false;
    }

    // 3. Visibility check
    if (campaign.isHomepageVisible === false) {
      return false;
    }

    // 4. Date range check (Allow if dates not set, or if end date is still in the future)
    if (campaign.endDate) {
      const end = new Date(campaign.endDate);
      // Give a 30-day grace period for active/approved demo campaigns if needed
      if (!isNaN(end.getTime()) && end < now) {
        // If status is explicitly active, ignore strict past endDate for seamless demoing
        if (campaign.status !== BannerPromotionStatus.ACTIVE) {
          return false;
        }
      }
    }

    // 5. City targeting check (if targetCities specified, matches city or if city is 'global')
    if (campaign.targetCities && campaign.targetCities.length > 0 && city && city.toLowerCase() !== 'global') {
      const cityLower = city.trim().toLowerCase();
      const matchesCity = campaign.targetCities.some(
        (tc) => String(tc).trim().toLowerCase() === cityLower,
      );
      if (!matchesCity) {
        return false;
      }
    }

    return true;
  }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BannerEligibilityService } from './banner-eligibility.service';
import { BannerPromotion } from '../schemas/banner-promotion.schema';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BannerRotationPolicyService {
  private readonly logger = new Logger(BannerRotationPolicyService.name);

  constructor(
    private readonly eligibilityService: BannerEligibilityService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Evaluate complete eligibility pipeline for a banner
   */
  isEligible(campaign: BannerPromotion, city: string, now: Date = new Date()): boolean {
    return this.eligibilityService.isEligibleForCity(campaign, city, now);
  }

  /**
   * Check if a merchant is in a cooldown period (default 5 minutes)
   */
  async isMerchantInCooldown(merchantId: string, city: string, queueSize: number = 0): Promise<boolean> {
    // Disable strict cooldown if available queue is small (<= 9 campaigns) so slots are never left empty
    if (queueSize <= 9) return false;
    if (!this.redisService || !this.redisService.isEnabled()) return false;
    const client = this.redisService.getClient();
    if (!client) return false;

    try {
      const cooldownKey = `banner:cooldown:${(city || 'global').toLowerCase()}:${merchantId}`;
      const exists = await client.exists(cooldownKey);
      return exists === 1;
    } catch (err: any) {
      this.logger.error(`Cooldown check error for ${merchantId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Record merchant display to activate cooldown window
   */
  async setMerchantCooldown(merchantId: string, city: string, cooldownMinutes: number = 5): Promise<void> {
    if (!this.redisService || !this.redisService.isEnabled()) return;
    const client = this.redisService.getClient();
    if (!client) return;

    try {
      const cooldownKey = `banner:cooldown:${(city || 'global').toLowerCase()}:${merchantId}`;
      await client.set(cooldownKey, '1', { EX: cooldownMinutes * 60 });
    } catch (err: any) {
      this.logger.error(`Failed to set merchant cooldown for ${merchantId}: ${err.message}`);
    }
  }

  /**
   * Verify duplicate suppression rules across active slots
   */
  checkDuplicateSlot(
    requestId: string,
    merchantId: string,
    displayedBanners: Set<string>,
    displayedMerchants: Set<string>,
    queueSize: number,
  ): boolean {
    // 1. Same campaign cannot appear twice simultaneously
    if (displayedBanners.has(requestId)) {
      return true;
    }

    // 2. Same merchant cannot appear twice simultaneously (unless total queue size <= 9)
    if (queueSize > 9 && displayedMerchants.has(merchantId)) {
      return true;
    }

    return false;
  }
}

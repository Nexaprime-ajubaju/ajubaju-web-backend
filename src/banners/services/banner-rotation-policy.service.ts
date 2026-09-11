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

  isEligible(
    campaign: BannerPromotion,
    city: string,
    now: Date = new Date(),
  ): boolean {
    return this.eligibilityService.isEligibleForCity(campaign, city, now);
  }

  async isMerchantInCooldown(
    merchantId: string,
    city: string,
    queueSize: number = 0,
  ): Promise<boolean> {
    // If the queue size is 10 or less, we don't need cooldowns because there's enough space for all banners.
    if (queueSize <= 10) return false;

    if (!this.redisService || !this.redisService.isEnabled()) return false;
    const client = this.redisService.getClient();
    if (!client) return false;

    try {
      const cooldownKey = `banner:cooldown:${(city || 'global').toLowerCase()}:${merchantId}`;
      const exists = await client.exists(cooldownKey);
      return exists === 1;
    } catch (err: any) {
      this.logger.error(
        `Cooldown check error for ${merchantId}: ${err.message}`,
      );
      return false;
    }
  }

  async setMerchantCooldown(
    merchantId: string,
    city: string,
    cooldownMinutes: number = 5,
  ): Promise<void> {
    if (!this.redisService || !this.redisService.isEnabled()) return;
    const client = this.redisService.getClient();
    if (!client) return;

    try {
      const cooldownKey = `banner:cooldown:${(city || 'global').toLowerCase()}:${merchantId}`;
      await client.set(cooldownKey, '1', { EX: cooldownMinutes * 60 });
    } catch (err: any) {
      this.logger.error(
        `Failed to set merchant cooldown for ${merchantId}: ${err.message}`,
      );
    }
  }

  checkDuplicateSlot(
    requestId: string,
    merchantId: string,
    displayedBanners: Set<string>,
    displayedMerchants: Set<string>,
    queueSize: number,
  ): boolean {
    // 1. Same campaign MUST NOT appear twice simultaneously in the slider.
    if (displayedBanners.has(requestId)) {
      return true;
    }

    // 2. Same merchant cannot occupy multiple slots UNLESS the queue size is 10 or less.
    // This allows a single merchant to occupy all 10 slots if they have 10 distinct campaigns.
    if (queueSize > 10 && displayedMerchants.has(merchantId)) {
      return true;
    }

    return false;
  }
}

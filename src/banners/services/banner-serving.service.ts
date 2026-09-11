import { Injectable, Logger, Optional } from '@nestjs/common';
import { BannerCacheService } from './banner-cache.service';
import { BannerRotationSchedulerService } from './banner-rotation-scheduler.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BannerServingService {
  private readonly logger = new Logger(BannerServingService.name);

  constructor(
    private readonly cacheService: BannerCacheService,
    private readonly rotationScheduler: BannerRotationSchedulerService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Fast Redis-first homepage banner serving endpoint (<10ms latency)
   * With automatic Mongo fallback and Redis auto-healing
   */
  async getActiveHomepageBanners(
    city?: string,
    fullLocationStr?: string,
    limit: number = 10,
  ): Promise<any[]> {
    const locationsToTry: string[] = [];

    // Parse the full location string from most specific to least specific
    if (fullLocationStr) {
      const parts = fullLocationStr
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      for (const p of parts) {
        if (!locationsToTry.includes(p)) locationsToTry.push(p);
      }
    }

    if (city) {
      const rawCity = city.trim().toLowerCase();
      const cityNormalized = rawCity.split(',')[0].trim();
      if (!locationsToTry.includes(cityNormalized))
        locationsToTry.push(cityNormalized);
    }

    if (!locationsToTry.includes('global')) locationsToTry.push('global');

    const finalBanners = [];
    const seenBannerIds = new Set();

    for (const loc of locationsToTry) {
      if (finalBanners.length >= limit) break;

      // 1. Try reading from Redis Hash slots
      let slotsMap = await this.cacheService.getAllSlots(loc);

      // 2. Redis Miss / Connection Glitch / First-run Fallback & Auto-Healing
      if (!slotsMap || Object.keys(slotsMap).length === 0) {
        this.logger.log(
          `Redis cache miss for location [${loc}]. Initiating auto-healing rotation.`,
        );

        // Trigger auto-healing rotation
        await this.rotationScheduler.rotateCitySlots(loc);
        slotsMap = await this.cacheService.getAllSlots(loc);
      }

      if (slotsMap) {
        // Convert slots map to array ordered by slot number
        const bannerList = Object.keys(slotsMap)
          .map((k) => parseInt(k, 10))
          .sort((a, b) => a - b)
          .map((slotNum) => slotsMap[slotNum])
          .filter(Boolean);

        for (const banner of bannerList) {
          const bannerId = String(banner.id || banner._id || banner.requestId);
          if (!seenBannerIds.has(bannerId)) {
            seenBannerIds.add(bannerId);
            finalBanners.push(banner);
            if (finalBanners.length >= limit) break;
          }
        }
        this.logger.log(
          `[DEBUG] Added banners from ${loc}, finalBanners.length is now ${finalBanners.length}`,
        );
      }
    }

    return finalBanners;
  }
}

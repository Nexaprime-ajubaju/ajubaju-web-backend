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
  async getActiveHomepageBanners(city?: string, limit: number = 10): Promise<any[]> {
    const rawCity = (city || 'global').trim().toLowerCase();
    const cityNormalized = rawCity.split(',')[0].trim();

    // 1. Try reading from Redis Hash slots
    let slotsMap = await this.cacheService.getAllSlots(cityNormalized);

    // 2. Redis Miss / Connection Glitch / First-run Fallback & Auto-Healing
    if (!slotsMap || Object.keys(slotsMap).length === 0) {
      this.logger.warn(`Redis cache miss or fallback triggered for city [${cityNormalized}]. Initiating auto-healing rotation.`);
      
      // Trigger auto-healing rotation
      await this.rotationScheduler.rotateCitySlots(cityNormalized);
      slotsMap = await this.cacheService.getAllSlots(cityNormalized);
    }

    if (!slotsMap) {
      this.logger.error(`Unable to serve Redis slots for city [${cityNormalized}] after auto-healing fallback.`);
      return [];
    }

    // Convert 1..9 slots map to array ordered by slot number
    const bannerList = Object.keys(slotsMap)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b)
      .map((slotNum) => slotsMap![slotNum])
      .filter(Boolean);

    return bannerList.slice(0, limit);
  }
}

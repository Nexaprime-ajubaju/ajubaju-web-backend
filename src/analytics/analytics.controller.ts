import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RedisService } from '../common/services/redis.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly redisService: RedisService,
  ) {}

  private async getOrCache<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redisService.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await loader();
    await this.redisService.set(key, data, ttl);
    return data;
  }

  @Get('device-breakdown')
  async getDeviceBreakdown() {
    const data = await this.getOrCache(
      'golo:analytics:device-breakdown',
      180,
      () => this.analyticsService.getDeviceBreakdown(),
    );
    return { success: true, data };
  }

  @Get('top-regions')
  async getTopRegions() {
    const data = await this.getOrCache('golo:analytics:top-regions', 180, () =>
      this.analyticsService.getTopRegions(),
    );
    return { success: true, data };
  }

  @Get('top-pages')
  async getTopPages() {
    const data = await this.getOrCache('golo:analytics:top-pages', 180, () =>
      this.analyticsService.getTopPages(),
    );
    return { success: true, data };
  }

  @Get('events')
  async getEvents() {
    const data = await this.getOrCache('golo:analytics:events', 120, () =>
      this.analyticsService.getEvents(),
    );
    return { success: true, data };
  }

  @Get('recent-activity')
  async getRecentActivity() {
    const data = await this.getOrCache(
      'golo:analytics:recent-activity',
      60,
      () => this.analyticsService.getRecentActivity(),
    );
    return { success: true, data };
  }
}

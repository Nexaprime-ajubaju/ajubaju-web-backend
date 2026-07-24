import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BannerImpression, BannerImpressionDocument } from '../schemas/banner-impression.schema';
import { BannerClick, BannerClickDocument } from '../schemas/banner-click.schema';
import { BannerCacheService } from './banner-cache.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BannerTrackingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BannerTrackingService.name);

  private impressionBuffer: Array<{
    bannerId: string;
    merchantId: string;
    userId: string;
    city: string;
    slot: number;
    generation: number;
    shownAt: Date;
  }> = [];

  private clickBuffer: Array<{
    bannerId: string;
    merchantId: string;
    userId: string;
    city: string;
    clickedAt: Date;
  }> = [];

  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(BannerImpression.name)
    private readonly impressionModel: Model<BannerImpressionDocument>,
    @InjectModel(BannerClick.name)
    private readonly clickModel: Model<BannerClickDocument>,
    private readonly cacheService: BannerCacheService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  onModuleInit() {
    this.flushInterval = setInterval(() => this.flushBuffers(), 5000);
  }

  onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushBuffers();
  }

  /**
   * Track Impression (HMAC Signed Verification + Async buffering)
   */
  trackImpression(dto: {
    bannerId: string;
    merchantId: string;
    userId?: string;
    city?: string;
    slot?: number;
    generation?: number;
    token?: string;
  }): boolean {
    if (!dto.bannerId || !dto.merchantId) return false;

    // 1. HMAC Verification (Anti-Fraud Protection)
    if (dto.token) {
      const isValid = this.cacheService.verifyImpressionToken(
        dto.bannerId,
        dto.slot || 1,
        dto.generation || 0,
        dto.token,
      );
      if (!isValid) {
        this.logger.warn(`Rejected unverified/spoofed impression token for banner [${dto.bannerId}]`);
        return false;
      }
    }

    // 2. Push payload to buffer
    this.impressionBuffer.push({
      bannerId: dto.bannerId,
      merchantId: dto.merchantId,
      userId: dto.userId || 'anonymous',
      city: (dto.city || 'global').trim().toLowerCase(),
      slot: dto.slot || 1,
      generation: dto.generation || 0,
      shownAt: new Date(),
    });

    if (this.impressionBuffer.length >= 100) {
      this.flushBuffers();
    }
    return true;
  }

  /**
   * Track Click (30s Deduplication Window + Async buffering)
   */
  async trackClick(dto: {
    bannerId: string;
    merchantId: string;
    userId?: string;
    city?: string;
  }): Promise<boolean> {
    if (!dto.bannerId || !dto.merchantId) return false;

    const userIdentifier = dto.userId || 'anonymous';
    const dedupeKey = `click:dedupe:${userIdentifier}:${dto.bannerId}`;

    // 30-Second Click Deduplication Window
    if (this.redisService && this.redisService.isEnabled()) {
      const client = this.redisService.getClient();
      if (client) {
        const exists = await client.exists(dedupeKey);
        if (exists === 1) {
          this.logger.debug(`Ignored duplicate click from ${userIdentifier} for banner [${dto.bannerId}] (30s dedupe)`);
          return false;
        }
        await client.set(dedupeKey, '1', { EX: 30 }); // 30s TTL
      }
    }

    this.clickBuffer.push({
      bannerId: dto.bannerId,
      merchantId: dto.merchantId,
      userId: userIdentifier,
      city: (dto.city || 'global').trim().toLowerCase(),
      clickedAt: new Date(),
    });

    if (this.clickBuffer.length >= 100) {
      this.flushBuffers();
    }
    return true;
  }

  private async flushBuffers() {
    if (this.impressionBuffer.length > 0) {
      const impressionsToFlush = [...this.impressionBuffer];
      this.impressionBuffer = [];
      try {
        await this.impressionModel.insertMany(impressionsToFlush, { ordered: false });
      } catch (err: any) {
        this.logger.error(`Failed to flush impressions batch: ${err.message}`);
      }
    }

    if (this.clickBuffer.length > 0) {
      const clicksToFlush = [...this.clickBuffer];
      this.clickBuffer = [];
      try {
        await this.clickModel.insertMany(clicksToFlush, { ordered: false });
      } catch (err: any) {
        this.logger.error(`Failed to flush clicks batch: ${err.message}`);
      }
    }
  }
}

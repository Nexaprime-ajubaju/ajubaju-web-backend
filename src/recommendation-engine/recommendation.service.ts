import { Injectable, Logger } from '@nestjs/common';
import { RecommendationFactory } from './recommendation.factory';
import { RecommendationContext } from './interfaces/recommendation.context';
import { RecommendationSectionDto } from './dto/recommendation-section.dto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExperimentService } from './experimentation/experiment.service';
import { RedisService } from '../common/services/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  // Constants for version tracking
  private readonly FEATURE_VERSION = '2026-06-28';
  private readonly RANKING_VERSION = 'v1.2.0';

  constructor(
    private readonly factory: RecommendationFactory,
    private readonly eventEmitter: EventEmitter2,
    private readonly experimentService: ExperimentService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async executeStrategy(key: string, context: RecommendationContext, title: string, requestId?: string): Promise<RecommendationSectionDto> {
    const strategy = this.factory.get(key);
    const defaultCacheTTL = this.configService.get<number>('RECOMMENDATION_CACHE_TTL', 300);
    const cacheTTL = strategy.cacheTTL || defaultCacheTTL;

    // Assign experiment variant
    const variant = await this.experimentService.assignVariant(context.userId);
    context.experimentVariant = variant;

    // Build cache key based on context and version
    const versionStr = (await this.redisService.get('recommendation:cache:version')) || '1';
    const cacheKey = `recommendations:v${versionStr}:strategy:${key}:${context.userId || 'guest'}:${context.city || 'all'}:${variant}`;

    // Check cache
    const cachedData = await this.redisService.get(cacheKey);
    const now = Date.now();
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      this.logger.debug(`Cache hit for ${cacheKey}`);
      this.eventEmitter.emit('recommendation.generated', {
        strategy: key,
        executionTime: 0, // negligible
        cacheHit: true,
        productCount: parsedData.length,
        userId: context.userId,
        requestId,
        variant,
        results: parsedData.map((p, index) => ({ productId: p.id || p._id?.toString(), rank: index + 1 })),
      });
      return this.buildResponse(key, title, parsedData, true, '1.0', requestId, variant);
    }

    try {
      this.logger.debug(`Executing strategy ${key} (cache miss for ${cacheKey})`);
      const startTime = Date.now();
      
      const products = await strategy.getRecommendations(context);
      
      const executionTime = Date.now() - startTime;
      
      // Store in Redis cache
      await this.redisService.set(cacheKey, JSON.stringify(products), cacheTTL);

      this.eventEmitter.emit('recommendation.generated', {
        strategy: key,
        executionTime,
        cacheHit: false,
        productCount: products.length,
        userId: context.userId,
        requestId,
        variant,
        results: products.map((p, index) => ({ productId: p.id || p._id?.toString(), rank: index + 1 })),
      });

      return this.buildResponse(key, title, products, false, '1.0', requestId, variant);
    } catch (error) {
      this.logger.error(`Strategy ${key} failed: ${error.message}`, error.stack);
      
      this.eventEmitter.emit('recommendation.generated', {
        strategy: key,
        executionTime: Date.now() - now, // Approximate error latency
        cacheHit: false,
        productCount: 0,
        userId: context.userId,
        error: error.message,
        requestId,
        variant,
        results: [],
      });

      // Return empty payload for isolated failure
      return this.buildResponse(key, title, [], false, '1.0', requestId, variant);
    }
  }

  private buildResponse(
    key: string, 
    title: string, 
    products: any[], 
    cacheHit: boolean, 
    version: string,
    requestId?: string,
    variant?: string
  ): RecommendationSectionDto {
    return {
      key,
      title,
      strategy: key,
      products,
      metadata: {
        generatedAt: new Date().toISOString(),
        cacheHit,
        strategyVersion: version,
        rankingVersion: this.RANKING_VERSION,
        featureVersion: this.FEATURE_VERSION,
        experimentVariant: variant || 'default',
        totalProducts: products.length,
        requestId,
      }
    };
  }
}

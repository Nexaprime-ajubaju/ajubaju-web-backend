import { Injectable, Logger } from '@nestjs/common';
import { RecommendationFactory } from './recommendation.factory';
import { RecommendationContext } from './interfaces/recommendation.context';
import { RecommendationSectionDto, RecommendationSectionMetadataDto } from './dto/recommendation-section.dto';

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
      const parsedData = JSON.parse(cachedData as string);
      // Compatibility check: old cache might just be array of products
      const isOldCache = Array.isArray(parsedData);
      const products = isOldCache ? parsedData : parsedData.products;
      const strategyMetadata = isOldCache ? {
        confidence: 0,
        reason: 'cache_migration',
        source: 'cache'
      } : parsedData.metadata;

      this.logger.debug(`Cache hit for ${cacheKey}`);
      this.eventEmitter.emit('recommendation.generated', {
        strategy: key,
        executionTime: 0, // negligible
        cacheHit: true,
        productCount: products.length,
        userId: context.userId,
        requestId,
        variant,
        results: products.map((p, index) => ({ productId: p.id || p._id?.toString(), rank: index + 1 })),
      });
      return this.buildResponse(key, title, products, true, '1.0', requestId, variant, strategyMetadata, 0);
    }

    try {
      this.logger.debug(`Executing strategy ${key} (cache miss for ${cacheKey})`);
      const startTime = Date.now();
      
      const strategyResult = await strategy.getRecommendations(context);
      
      const executionTime = Date.now() - startTime;
      
      const products = strategyResult.products;
      const strategyMetadata = strategyResult.metadata;
      
      // Store in Redis cache
      await this.redisService.set(cacheKey, JSON.stringify({ products, metadata: strategyMetadata }), cacheTTL);

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

      return this.buildResponse(key, title, products, false, '1.0', requestId, variant, strategyMetadata, executionTime);
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

      const fallbackMetadata = {
        confidence: 0,
        reason: 'strategy_error',
        source: 'fallback'
      };

      // Return empty payload for isolated failure
      return this.buildResponse(key, title, [], false, '1.0', requestId, variant, fallbackMetadata, Date.now() - now);
    }
  }

  private buildResponse(
    key: string, 
    title: string, 
    products: any[], 
    cacheHit: boolean, 
    version: string,
    requestId?: string,
    variant?: string,
    strategyMetadata?: any,
    executionTime?: number
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
        experimentVariant: variant || 'default',
        totalProducts: products.length,
        requestId,
        confidence: strategyMetadata?.confidence || 0,
        reason: strategyMetadata?.reason || 'unknown',
        source: strategyMetadata?.source || 'unknown',
        fallbackUsed: strategyMetadata?.fallbackUsed,
        retrievedCandidates: strategyMetadata?.retrievedCandidates,
        returnedProducts: products.length,
        executionTime: executionTime,
      }
    };
  }
}

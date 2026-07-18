import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import {
  RecommendationEvent,
  RecommendationEventDocument,
} from './schemas/recommendation-event.schema';
import {
  RecommendationLog,
  RecommendationLogDocument,
} from './schemas/recommendation-log.schema';
import { RedisService } from '../common/services/redis.service';

import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RecommendationAnalyticsService {
  private readonly logger = new Logger(RecommendationAnalyticsService.name);
  private readonly QUEUE_KEY = 'recommendations:analytics:impressions';
  private readonly BATCH_SIZE = 500;

  constructor(
    @InjectModel(RecommendationEvent.name)
    private readonly eventModel: Model<RecommendationEventDocument>,
    @InjectModel(RecommendationLog.name)
    private readonly logModel: Model<RecommendationLogDocument>,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('recommendation.generated')
  async handleRecommendationGenerated(payload: any) {
    try {
      await this.logModel.create({
        strategy: payload.strategy,
        executionTime: payload.executionTime,
        cacheHit: payload.cacheHit,
        productCount: payload.productCount,
        userId: payload.userId,
        error: payload.error,
        requestId: payload.requestId,
        variant: payload.variant,
        results: payload.results,
      });
    } catch (error) {
      this.logger.error(
        `Failed to log recommendation system diagnostic: ${error.message}`,
      );
    }
  }

  async recordEvents(events: any[]) {
    if (!events || !events.length) return;

    const highPriorityEvents = [];
    const impressionEvents = [];

    for (const event of events) {
      if (event.eventType === 'impression') {
        // Expand batched frontend impression into individual product impressions
        const products = event.products || [];
        for (const p of products) {
          // Server-side Deduplication check via Redis
          const dedupeKey = `impression:${event.sessionId || 'guest'}:${event.strategy}:${p.id}`;

          if (this.redisService.isEnabled()) {
            const exists = await this.redisService.exists(dedupeKey);
            if (exists) continue; // Skip duplicate
            await this.redisService.set(dedupeKey, '1', 1800); // 30 min TTL
          }

          impressionEvents.push(
            JSON.stringify({
              ...event,
              productId: p.id,
              position: p.position,
              tags: p.tags,
              categoryId: p.categoryId,
              merchantId: p.merchantId,
              products: undefined, // remove array
            }),
          );
        }
      } else {
        // Explode clicks as well if they come in batched (usually single)
        const products = event.products || [];
        if (products.length > 0) {
          for (const p of products) {
            highPriorityEvents.push({
              ...event,
              productId: p.id,
              position: p.position,
              tags: p.tags,
              categoryId: p.categoryId,
              merchantId: p.merchantId,
              products: undefined,
            });
          }
        } else {
          highPriorityEvents.push(event);
        }
      }
    }

    if (impressionEvents.length > 0) {
      if (this.redisService.isEnabled()) {
        await this.redisService.lPush(this.QUEUE_KEY, impressionEvents);
      } else {
        // Fallback for immediate write if Redis is down
        const parsed = impressionEvents.map((e) => JSON.parse(e));
        await this.eventModel
          .insertMany(parsed)
          .catch((e) => this.logger.error(e.message));
      }
    }

    if (highPriorityEvents.length > 0) {
      try {
        // For individual high-priority events, user recommended insertOne/create
        // We iterate and create them immediately
        for (const evt of highPriorityEvents) {
          await this.eventModel.create(evt);
        }
        this.eventEmitter.emit('analytics.events.recorded', highPriorityEvents);
      } catch (error) {
        this.logger.error(
          `Failed to record high-priority events: ${error.message}`,
        );
      }
    }
  }

  @Cron('*/30 * * * * *') // Every 30 seconds
  async handleCronFlush() {
    if (!this.redisService.isEnabled()) return;

    try {
      const items = await this.redisService.rPopCount(
        this.QUEUE_KEY,
        this.BATCH_SIZE,
      );
      if (!items || items.length === 0) return;

      const parsedItems = items.map((itemStr) => JSON.parse(itemStr));
      const operations = parsedItems.map((event) => ({
        insertOne: { document: event },
      }));

      await this.eventModel.bulkWrite(operations);
      this.logger.debug(
        `Flushed ${items.length} impression events via bulkWrite.`,
      );

      this.eventEmitter.emit('analytics.events.recorded', parsedItems);

      // If we got a full batch, there might be more. The next cron will pick it up.
    } catch (error) {
      this.logger.error(
        `Failed to bulkWrite impressions from Redis: ${error.message}`,
      );
    }
  }
}

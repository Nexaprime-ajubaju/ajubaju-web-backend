import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import {
  RecommendationEvent,
  RecommendationEventDocument,
} from './schemas/recommendation-event.schema';
import {
  RecommendationLog,
  RecommendationLogDocument,
} from './schemas/recommendation-log.schema';
import {
  RecommendationMetric,
  RecommendationMetricDocument,
} from './schemas/recommendation-metric.schema';

@Injectable()
export class RecommendationMetricsService {
  private readonly logger = new Logger(RecommendationMetricsService.name);

  constructor(
    @InjectModel(RecommendationEvent.name)
    private readonly eventModel: Model<RecommendationEventDocument>,
    @InjectModel(RecommendationLog.name)
    private readonly logModel: Model<RecommendationLogDocument>,
    @InjectModel(RecommendationMetric.name)
    private readonly metricModel: Model<RecommendationMetricDocument>,
  ) {}

  @Cron('5 * * * *') // Run at minute 5 of every hour
  async computeHourlyMetrics() {
    this.logger.log('Starting hourly recommendation metrics computation...');
    try {
      // Find the start of the previous hour
      const now = new Date();
      const startOfPreviousHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() - 1,
        0,
        0,
        0,
      );
      const endOfPreviousHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        0,
        0,
        0,
      );

      const timeWindow = startOfPreviousHour.toISOString();

      // 1. Aggregate Impressions from Logs
      const logStats = await this.logModel.aggregate([
        {
          $match: {
            timestamp: { $gte: startOfPreviousHour, $lt: endOfPreviousHour },
          },
        },
        { $unwind: '$results' },
        {
          $group: {
            _id: { strategy: '$strategy', variant: '$variant' },
            served: { $sum: 1 }, // Total number of product impressions
            totalRank: { $sum: '$results.rank' },
            uniqueProducts: { $addToSet: '$results.productId' },
          },
        },
      ]);

      // 2. Aggregate Events (Views, Clicks, Cart, Purchase) mapped back to strategy/variant via requestId
      // Note: A real robust implementation would join RecommendationEvent with RecommendationLog using requestId to get strategy/variant
      // For MVP, we'll do a join in MongoDB
      const eventStats = await this.eventModel.aggregate([
        {
          $match: {
            timestamp: { $gte: startOfPreviousHour, $lt: endOfPreviousHour },
            requestId: { $exists: true, $ne: null },
          },
        },
        // Lookup the log to find strategy and variant
        {
          $lookup: {
            from: 'recommendation_logs',
            localField: 'requestId',
            foreignField: 'requestId',
            as: 'log',
          },
        },
        { $unwind: '$log' },
        {
          $group: {
            _id: { strategy: '$log.strategy', variant: '$log.variant' },
            viewed: {
              $sum: { $cond: [{ $eq: ['$eventType', 'view'] }, 1, 0] },
            },
            clicked: {
              $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] },
            },
            wishlisted: {
              $sum: { $cond: [{ $eq: ['$eventType', 'wishlist'] }, 1, 0] },
            },
            carted: {
              $sum: { $cond: [{ $eq: ['$eventType', 'add_to_cart'] }, 1, 0] },
            },
            purchased: {
              $sum: { $cond: [{ $eq: ['$eventType', 'purchase'] }, 1, 0] },
            },
          },
        },
      ]);

      const metricsMap = new Map();

      // Merge log stats
      for (const stat of logStats) {
        const key = `${stat._id.strategy}-${stat._id.variant}`;
        metricsMap.set(key, {
          strategy: stat._id.strategy,
          variant: stat._id.variant,
          served: stat.served,
          averageRank: stat.served > 0 ? stat.totalRank / stat.served : 0,
          coverage: stat.uniqueProducts.length,
          viewed: 0,
          clicked: 0,
          wishlisted: 0,
          carted: 0,
          purchased: 0,
        });
      }

      // Merge event stats
      for (const stat of eventStats) {
        const key = `${stat._id.strategy}-${stat._id.variant}`;
        let metric = metricsMap.get(key);
        if (!metric) {
          metric = {
            strategy: stat._id.strategy,
            variant: stat._id.variant,
            served: 0,
            averageRank: 0,
            coverage: 0,
            viewed: 0,
            clicked: 0,
            wishlisted: 0,
            carted: 0,
            purchased: 0,
          };
          metricsMap.set(key, metric);
        }

        metric.viewed += stat.viewed;
        metric.clicked += stat.clicked;
        metric.wishlisted += stat.wishlisted;
        metric.carted += stat.carted;
        metric.purchased += stat.purchased;
      }

      let count = 0;
      for (const metric of metricsMap.values()) {
        const ctr = metric.served > 0 ? metric.clicked / metric.served : 0;
        const cvr = metric.clicked > 0 ? metric.purchased / metric.clicked : 0;

        await this.metricModel.updateOne(
          { strategy: metric.strategy, variant: metric.variant, timeWindow },
          {
            $set: {
              ...metric,
              ctr,
              cvr,
              timeWindow,
            },
          },
          { upsert: true },
        );
        count++;
      }

      this.logger.log(
        `Computed and stored ${count} hourly recommendation metric records.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to compute hourly recommendation metrics: ${error.message}`,
      );
    }
  }
}

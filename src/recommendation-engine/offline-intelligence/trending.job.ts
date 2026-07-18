import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrendingProduct,
  TrendingProductDocument,
} from './schemas/trending-product.schema';
import {
  RecommendationEvent,
  RecommendationEventDocument,
} from '../../analytics/schemas/recommendation-event.schema';
import { Ad, AdDocument } from '../../ads/schemas/category-schemas/ad.schema';
import { OfflineRecommendationJob } from './offline-job.interface';

@Injectable()
export class TrendingJob implements OfflineRecommendationJob {
  private readonly logger = new Logger(TrendingJob.name);
  readonly key = 'trending';
  readonly schedule = '0 */6 * * *'; // Every 6 hours

  constructor(
    @InjectModel(TrendingProduct.name)
    private readonly trendingModel: Model<TrendingProductDocument>,
    @InjectModel(RecommendationEvent.name)
    private readonly eventModel: Model<RecommendationEventDocument>,
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
  ) {}

  async execute(): Promise<void> {
    this.logger.log('Starting offline Trending computation...');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // 1. Aggregate recent events (last 24h) to find hot products
      const hotProducts = await this.eventModel.aggregate([
        {
          $match: {
            timestamp: { $gte: yesterday },
            eventType: { $in: ['view', 'click', 'add_to_cart'] },
          },
        },
        {
          $group: {
            _id: '$productId',
            score: {
              $sum: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$eventType', 'view'] }, then: 1 },
                    { case: { $eq: ['$eventType', 'click'] }, then: 5 },
                    { case: { $eq: ['$eventType', 'add_to_cart'] }, then: 15 },
                  ],
                  default: 0,
                },
              },
            },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 1000 },
      ]);

      if (hotProducts.length === 0) {
        this.logger.log('No recent events found for trending computation.');
        return;
      }

      // 2. Fetch product geohash (or derive from location)
      // For MVP, we will group all trending items under a global "global" geohash,
      // but in production, we would derive geohash5 from ad.locationCoordinates

      const bulkOps = [];
      let rank = 1;

      for (const item of hotProducts) {
        bulkOps.push({
          updateOne: {
            filter: { productId: item._id, geohash: 'global' },
            update: {
              $set: {
                score: item.score,
                rank: rank++,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }

      if (bulkOps.length > 0) {
        // Clear out old trending products for 'global' (or run this as a sync)
        await this.trendingModel.deleteMany({ geohash: 'global' });
        await this.trendingModel.bulkWrite(bulkOps);
      }

      this.logger.log(`Computed trending for ${bulkOps.length} products.`);
    } catch (error) {
      this.logger.error(`Failed to compute trending: ${error.message}`);
    }
  }
}

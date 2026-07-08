import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OfflineRecommendationJob } from './offline-job.interface';
import {
  RecommendationEvent,
  RecommendationEventDocument,
} from '../../analytics/schemas/recommendation-event.schema';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

@Injectable()
export class BestSellersJob implements OfflineRecommendationJob {
  private readonly logger = new Logger(BestSellersJob.name);
  readonly key = 'best_sellers';
  readonly schedule = '0 2 * * *'; // Every day at 2 AM

  constructor(
    @InjectModel(RecommendationEvent.name)
    private readonly eventModel: Model<RecommendationEventDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async execute(): Promise<void> {
    this.logger.log('Executing best sellers offline job...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Aggregate purchases and add to cart events to find top products
    const pipeline = [
      {
        $match: {
          eventType: { $in: ['purchase', 'add_to_cart'] },
          createdAt: { $gte: sevenDaysAgo },
          productId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$productId',
          purchaseCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'purchase'] }, 1, 0] },
          },
          cartCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'add_to_cart'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          productId: '$_id',
          score: {
            $add: [{ $multiply: ['$purchaseCount', 10] }, '$cartCount'],
          },
        },
      },
      { $sort: { score: -1 as any } },
      { $limit: 100 },
    ];

    const results = await this.eventModel.aggregate(pipeline).exec();

    if (results.length > 0) {
      const collection = this.connection.collection('best_sellers');
      await collection.deleteMany({});

      const records = results.map((r, i) => ({
        productId: r.productId.toString(),
        score: r.score,
        rank: i + 1,
        updatedAt: new Date(),
      }));

      await collection.insertMany(records);
      this.logger.log(
        `Inserted ${records.length} records into best_sellers collection.`,
      );
    } else {
      this.logger.log('No purchase/cart data found for best sellers job.');
    }
  }
}

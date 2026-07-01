import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OfflineRecommendationJob } from './offline-job.interface';
import { RecommendationEvent, RecommendationEventDocument } from '../../analytics/schemas/recommendation-event.schema';
import { SimilarCustomer, SimilarCustomerDocument } from './schemas/similar-customer.schema';

@Injectable()
export class SimilarCustomersJob implements OfflineRecommendationJob {
  private readonly logger = new Logger(SimilarCustomersJob.name);
  readonly key = 'similar_customers';
  readonly schedule = '0 4 * * *'; // 4 AM daily

  constructor(
    @InjectModel(RecommendationEvent.name) private readonly eventModel: Model<RecommendationEventDocument>,
    @InjectModel(SimilarCustomer.name) private readonly similarCustomerModel: Model<SimilarCustomerDocument>
  ) {}

  async execute(): Promise<void> {
    this.logger.log('Starting SimilarCustomersJob');
    const startTime = Date.now();
    let computedCount = 0;

    try {
      // 1. Fetch recent events (last 30 days) to build interaction matrix
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const events = await this.eventModel.find({
        timestamp: { $gte: thirtyDaysAgo },
        productId: { $exists: true, $ne: null },
        userId: { $exists: true, $ne: null }
      })
      .select('userId productId eventType')
      .lean();

      this.logger.log(`Fetched ${events.length} events for collaborative filtering`);

      // 2. Build Weighted Interaction Vectors
      // User -> Product -> Score
      const userVectors: Record<string, Record<string, number>> = {};
      const userProducts: Record<string, Set<string>> = {};

      const eventWeights: Record<string, number> = {
        purchase: 10,
        add_to_cart: 6,
        wishlist: 5,
        click: 3,
        view: 1
      };

      for (const event of events) {
        const uId = event.userId;
        const pId = event.productId;
        const weight = eventWeights[event.eventType] || 0;

        if (weight === 0) continue;

        if (!userVectors[uId]) {
          userVectors[uId] = {};
          userProducts[uId] = new Set();
        }

        userVectors[uId][pId] = (userVectors[uId][pId] || 0) + weight;
        userProducts[uId].add(pId);
      }

      const userIds = Object.keys(userVectors);
      if (userIds.length < 2) {
        this.logger.log('Not enough users for collaborative filtering');
        return;
      }

      // 3. Clear old recommendations
      await this.similarCustomerModel.deleteMany({});

      const batch = [];

      // 4. Compute Similarity (Sparse-friendly overlapping weights)
      for (let i = 0; i < userIds.length; i++) {
        const sourceUser = userIds[i];
        const sourceProducts = userVectors[sourceUser];
        const similarities = [];

        for (let j = 0; j < userIds.length; j++) {
          if (i === j) continue;
          const targetUser = userIds[j];
          const targetProducts = userVectors[targetUser];

          let overlapScore = 0;
          for (const pId in sourceProducts) {
            if (targetProducts[pId]) {
              // Add product of their weights to represent magnitude of overlap
              overlapScore += sourceProducts[pId] * targetProducts[pId];
            }
          }

          if (overlapScore > 0) {
            similarities.push({
              targetUser,
              score: overlapScore
            });
          }
        }

        // Sort by score and take top 5 similar users
        similarities.sort((a, b) => b.score - a.score);
        const topUsers = similarities.slice(0, 5);

        // Aggregate recommended products from those users
        const recommendedProducts = new Map<string, number>();
        for (const sim of topUsers) {
          const simUserProducts = userVectors[sim.targetUser];
          for (const pId in simUserProducts) {
            // Only recommend products the source user hasn't interacted with
            if (!userProducts[sourceUser].has(pId)) {
              recommendedProducts.set(
                pId, 
                (recommendedProducts.get(pId) || 0) + (simUserProducts[pId] * sim.score)
              );
            }
          }
        }

        // Sort recommended products by aggregated score
        const finalProducts = Array.from(recommendedProducts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(entry => entry[0]);

        if (finalProducts.length > 0) {
          // In this simplified architecture, we just store one record per source user with the array of recommended products
          batch.push({
            userId: sourceUser,
            similarUserId: topUsers[0] ? topUsers[0].targetUser : 'none', // Reference point
            similarityScore: topUsers[0] ? topUsers[0].score : 0,
            recommendedProductIds: finalProducts
          });
        }

        if (batch.length >= 1000) {
          await this.similarCustomerModel.insertMany(batch);
          computedCount += batch.length;
          batch.length = 0;
        }
      }

      if (batch.length > 0) {
        await this.similarCustomerModel.insertMany(batch);
        computedCount += batch.length;
      }

      const duration = (Date.now() - startTime) / 1000;
      this.logger.log(`Completed SimilarCustomersJob. Generated recommendations for ${computedCount} users in ${duration}s.`);
    } catch (error) {
      this.logger.error(`SimilarCustomersJob failed: ${error.message}`, error.stack);
    }
  }
}

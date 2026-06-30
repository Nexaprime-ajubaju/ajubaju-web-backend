import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';
import { Order, OrderDocument } from '../../orders/schemas/order.schema';
import { RecommendationEvent, RecommendationEventDocument } from '../../analytics/schemas/recommendation-event.schema';

@Injectable()
export class MerchantLoyaltyStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(MerchantLoyaltyStrategy.name);
  readonly key = 'merchant_loyalty';
  readonly cacheTTL = 300;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(RecommendationEvent.name) private readonly eventModel: Model<RecommendationEventDocument>,
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    if (!context.userId) {
      return [];
    }

    try {
      const limit = context.limit || 10;
      const merchantScores: Record<string, number> = {};

      // 1. Check Orders (Highest Confidence)
      const orders = await this.orderModel.find({ userId: context.userId }).select('merchantId status').lean();
      
      for (const order of orders) {
        if (!order.merchantId) continue;
        const mId = order.merchantId.toString();
        merchantScores[mId] = (merchantScores[mId] || 0) + (order.status === 'completed' ? 10 : 6);
      }

      // 2. Check Analytics Events as fallback / complement
      const events = await this.eventModel.find({ userId: context.userId }).select('merchantId eventType').lean();
      
      for (const event of events) {
        if (!event.merchantId) continue;
        const mId = event.merchantId.toString();
        
        let score = 0;
        switch (event.eventType) {
          case 'purchase': score = 10; break;
          case 'add_to_cart': score = 6; break;
          case 'wishlist': score = 5; break;
          case 'click': score = 3; break;
          case 'view': score = 1; break;
        }
        
        merchantScores[mId] = (merchantScores[mId] || 0) + score;
      }

      const sortedMerchants = Object.entries(merchantScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      if (sortedMerchants.length === 0) {
        return [];
      }

      // Retrieve Candidates
      const candidates = await this.candidateRetriever.findByMerchantIds(sortedMerchants, limit * 2);

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank prioritizing Affinity (as requested)
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        affinity: 0.6,
        distance: 0.2,
        popularity: 0.1,
        freshness: 0.1
      });

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in MerchantLoyaltyStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

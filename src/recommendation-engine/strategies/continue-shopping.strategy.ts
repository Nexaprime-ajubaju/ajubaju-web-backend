import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';
import { RecommendationEvent, RecommendationEventDocument } from '../../analytics/schemas/recommendation-event.schema';

@Injectable()
export class ContinueShoppingStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(ContinueShoppingStrategy.name);
  readonly key = 'continue_shopping';
  readonly cacheTTL = 300;

  constructor(
    @InjectModel(RecommendationEvent.name) private readonly eventModel: Model<RecommendationEventDocument>,
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: { confidence: 0, reason: RecommendationReason.ACTIVE_CART, source: RecommendationSource.ONLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    if (!context.userId) {
      this.logger.debug('No userId provided, returning empty list for continue_shopping');
      return emptyResult;
    }

    try {
      const limit = context.limit || 10;
      
      // 1. Fetch recent events to find purchased items to filter out
      const purchases = await this.eventModel.find({
        userId: context.userId,
        eventType: 'purchase',
        productId: { $exists: true, $ne: null }
      }).select('productId').lean();
      
      const purchasedProductIds = new Set(purchases.map(p => p.productId.toString()));

      // 2. Fetch engagement events (views, clicks, cart adds)
      const recentEvents = await this.eventModel.find({
        userId: context.userId,
        eventType: { $in: ['view', 'click', 'add_to_cart'] },
        productId: { $exists: true, $ne: null }
      })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

      if (recentEvents.length === 0) {
        return emptyResult;
      }

      // 3. Score based on Most Recent > Most Clicked > Highest Affinity
      const productStats: Record<string, { recentMs: number, clicks: number }> = {};
      
      for (const event of recentEvents) {
        const pId = event.productId.toString();
        
        // Filter out purchased
        if (purchasedProductIds.has(pId)) continue;

        if (!productStats[pId]) {
          productStats[pId] = { recentMs: new Date(event.createdAt).getTime(), clicks: 0 };
        }
        
        if (event.eventType === 'click' || event.eventType === 'add_to_cart') {
          productStats[pId].clicks += 1;
        }
        
        // Update to most recent timestamp
        const ts = new Date(event.createdAt).getTime();
        if (ts > productStats[pId].recentMs) {
          productStats[pId].recentMs = ts;
        }
      }

      const productIds = Object.keys(productStats);
      if (productIds.length === 0) return emptyResult;

      let confidence = 0.0;
      if (productIds.length >= 20) confidence = 0.95;
      else if (productIds.length >= 10) confidence = 0.8;
      else if (productIds.length >= 3) confidence = 0.6;
      else if (productIds.length >= 1) confidence = 0.4;

      // Fetch candidates using generic retriever
      const candidates = await this.candidateRetriever.findByProductIds(productIds, limit * 2);

      if (candidates.length === 0) return emptyResult;

      // Fetch Features
      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Inject custom stats onto candidates to be used in sorting
      candidates.forEach(c => {
        const stats = productStats[c._id.toString()];
        c.__recentMs = stats.recentMs;
        c.__clicks = stats.clicks;
      });

      // Rank using base affinity
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        affinity: 0.5,
        freshness: 0,
        popularity: 0,
        distance: 0
      });

      // Apply primary sorts: Recency > Clicks > Affinity
      ranked.sort((a, b) => {
        // Recency (group into buckets of 1 hour to prevent minor ms diffs from completely overriding clicks)
        const hourA = Math.floor(a.product.__recentMs / 3600000);
        const hourB = Math.floor(b.product.__recentMs / 3600000);
        if (hourA !== hourB) return hourB - hourA;

        // Clicks
        if (b.product.__clicks !== a.product.__clicks) return b.product.__clicks - a.product.__clicks;

        // Affinity (finalScore)
        return b.finalScore - a.finalScore;
      });

      // Post-Process (Diversity & Rules like active/in-stock/non-expired)
      const finalResults = this.postProcessor.process(ranked, limit);

      return {
        products: finalResults,
        metadata: {
          confidence,
          reason: RecommendationReason.ACTIVE_CART,
          source: RecommendationSource.ONLINE,
          fallbackUsed: false,
          retrievedCandidates: candidates.length,
          returnedProducts: finalResults.length
        }
      };
    } catch (error) {
      this.logger.error(`Error in ContinueShoppingStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}

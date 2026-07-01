import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class NewArrivalsStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(NewArrivalsStrategy.name);
  readonly key = 'new_arrivals';
  readonly cacheTTL = 600; // 10 mins

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: { confidence: 0, reason: RecommendationReason.LAST_7_DAYS, source: RecommendationSource.OFFLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    try {
      const limit = context.limit || 10;
      
      const fallbacks = [
        { days: 7, confidence: 0.95, reason: RecommendationReason.LAST_7_DAYS },
        { days: 14, confidence: 0.82, reason: RecommendationReason.LAST_14_DAYS },
        { days: 30, confidence: 0.65, reason: RecommendationReason.LAST_30_DAYS },
      ];

      let candidates = [];
      let usedFallback = fallbacks[0];
      let isFallback = false;

      for (let i = 0; i < fallbacks.length; i++) {
        const fallback = fallbacks[i];
        candidates = await this.candidateRetriever.findRecentProducts(fallback.days, limit * 2);

        if (candidates.length > 0) {
          usedFallback = fallback;
          isFallback = i > 0;
          break;
        }
      }

      if (candidates.length === 0) {
        return emptyResult;
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank heavily by freshness
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        freshness: 0.8,
        popularity: 0.2,
        affinity: 0,
        distance: 0
      });

      const processedProducts = this.postProcessor.process(ranked, limit);

      return {
        products: processedProducts,
        metadata: {
          confidence: usedFallback.confidence,
          reason: usedFallback.reason,
          source: RecommendationSource.ONLINE,
          fallbackUsed: isFallback,
          retrievedCandidates: candidates.length,
          returnedProducts: processedProducts.length
        }
      };
    } catch (error) {
      this.logger.error(`Error in NewArrivalsStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}

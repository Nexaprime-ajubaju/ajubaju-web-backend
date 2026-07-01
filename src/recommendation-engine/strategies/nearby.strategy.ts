import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class NearbyStrategy implements RecommendationStrategy {
  readonly key = 'nearby';
  readonly priority = 1;
  readonly cacheTTL = 300;
  readonly requiresLocation = true;
  private readonly logger = new Logger(NearbyStrategy.name);

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: { confidence: 0, reason: RecommendationReason.EXACT_COORDINATES, source: RecommendationSource.OFFLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    try {
      if (!context.latitude || !context.longitude) {
        return emptyResult;
      }
      const limit = context.limit || 10;
      
      const fallbacks = [
        { distance: 5, confidence: 0.98, reason: RecommendationReason.EXACT_COORDINATES },
        { distance: 20, confidence: 0.82, reason: RecommendationReason.EXPANDED_RADIUS },
        { distance: 100, confidence: 0.68, reason: RecommendationReason.ENTIRE_CITY },
      ];

      let candidates = [];
      let usedFallback = fallbacks[0];
      let isFallback = false;

      for (let i = 0; i < fallbacks.length; i++) {
        const fallback = fallbacks[i];
        candidates = await this.candidateRetriever.findNearby(
          { latitude: context.latitude, longitude: context.longitude }, 
          fallback.distance, 
          limit * 2
        );

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

      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.3,
        distance: 0.5,
        affinity: 0,
        freshness: 0.2
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
      this.logger.error(`Error in NearbyStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}

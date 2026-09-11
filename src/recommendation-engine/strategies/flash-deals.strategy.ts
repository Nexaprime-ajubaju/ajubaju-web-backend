import { Injectable, Logger } from '@nestjs/common';
import {
  RecommendationStrategy,
  StrategyResult,
  RecommendationReason,
  RecommendationSource,
} from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class FlashDealsStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(FlashDealsStrategy.name);
  readonly key = 'flash_deals';
  readonly cacheTTL = 300;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: {
        confidence: 0,
        reason: RecommendationReason.ACTIVE_DISCOUNTS,
        source: RecommendationSource.OFFLINE,
        retrievedCandidates: 0,
        returnedProducts: 0,
      },
    };

    try {
      const limit = context.limit || 10;

      let confidence = 0.95;
      let reason = RecommendationReason.ACTIVE_DISCOUNTS;
      let isFallback = false;
      let source = RecommendationSource.ONLINE;

      let candidates = await this.candidateRetriever.findDiscounted(
        limit * 2,
        context.latitude && context.longitude
          ? { latitude: context.latitude, longitude: context.longitude }
          : undefined,
        20, // maxDistanceKm
      );

      if (candidates.length === 0) {
        this.logger.debug(
          `No active discounts, falling back to promoted/sponsored items.`,
        );
        candidates = await this.candidateRetriever.findSponsored(limit * 2);
        confidence = 0.65;
        reason = RecommendationReason.PROMOTED_BANNERS;
        isFallback = true;
      }

      if (candidates.length === 0) {
        return emptyResult;
      }

      const candidateIds = candidates.map((c) => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank by discount (assuming we add discount component or just popularity for now)
      const ranked = this.rankingService.rankCandidates(
        candidates,
        features,
        context,
        null,
        {
          popularity: 0.6,
          freshness: 0.4,
          affinity: 0,
          distance: 0,
        },
      );

      const processedProducts = this.postProcessor.process(ranked, limit);

      return {
        products: processedProducts,
        metadata: {
          confidence,
          reason,
          source,
          fallbackUsed: isFallback,
          retrievedCandidates: candidates.length,
          returnedProducts: processedProducts.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error in FlashDealsStrategy: ${error.message}`,
        error.stack,
      );
      return emptyResult;
    }
  }
}

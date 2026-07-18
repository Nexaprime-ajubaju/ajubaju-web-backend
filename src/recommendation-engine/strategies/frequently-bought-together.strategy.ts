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
export class FrequentlyBoughtTogetherStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(FrequentlyBoughtTogetherStrategy.name);
  readonly key = 'frequently_bought_together';
  readonly cacheTTL = 3600;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    if (!context.productId) {
      this.logger.debug('No productId provided for FBT');
      return {
        products: [],
        metadata: {
          confidence: 0,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          retrievedCandidates: 0,
          returnedProducts: 0,
        },
      };
    }

    try {
      const limit = context.limit || 10;

      // Fetch offline recommendations generated for this specific product
      let candidates = await this.candidateRetriever.findOfflineCollection(
        'product_relationships',
        { sourceProductId: context.productId, relationshipType: 'fbt' },
        limit * 2,
      );

      if (candidates.length === 0) {
        this.logger.debug(
          `FBT offline collection empty for ${context.productId}, falling back to category match.`,
        );
        const originalProduct = (
          await this.candidateRetriever.findByProductIds([context.productId], 1)
        )[0];
        if (originalProduct && originalProduct.category) {
          candidates = await this.candidateRetriever.findByCategories(
            [originalProduct.category],
            limit * 2,
          );
          candidates = candidates.filter(
            (c) => c._id.toString() !== context.productId,
          );
        }
      }

      if (candidates.length === 0) {
        return {
          products: [],
          metadata: {
            confidence: 0,
            reason: RecommendationReason.MIXED_SIGNALS,
            source: RecommendationSource.ONLINE,
            retrievedCandidates: 0,
            returnedProducts: 0,
          },
        };
      }

      const candidateIds = candidates.map((c) => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank by popularity mainly
      const ranked = this.rankingService.rankCandidates(
        candidates,
        features,
        context,
        null,
        {
          popularity: 0.8,
          distance: 0.2,
          affinity: 0,
          freshness: 0,
        },
      );

      const products = this.postProcessor.process(ranked, limit);
      return {
        products,
        metadata: {
          confidence: 0.5,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          retrievedCandidates: products.length,
          returnedProducts: products.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error in FrequentlyBoughtTogetherStrategy: ${error.message}`,
        error.stack,
      );
      return {
        products: [],
        metadata: {
          confidence: 0,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          retrievedCandidates: 0,
          returnedProducts: 0,
        },
      };
    }
  }
}

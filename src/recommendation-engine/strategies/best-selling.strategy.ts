import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class BestSellingStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(BestSellingStrategy.name);
  readonly key = 'best_selling';
  readonly cacheTTL = 3600; // 1 hour

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: { confidence: 0, reason: RecommendationReason.OFFLINE_PURCHASES, source: RecommendationSource.OFFLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    try {
      const limit = context.limit || 10;
      
      let confidence = 0.95;
      let reason = RecommendationReason.OFFLINE_PURCHASES;
      let isFallback = false;
      let source = RecommendationSource.OFFLINE;

      let candidates = await this.candidateRetriever.findOfflineCollection('best_sellers', {}, limit * 2);

      if (candidates.length === 0) {
        this.logger.debug('Best sellers offline collection empty, falling back to popular products.');
        candidates = await this.candidateRetriever.findPopularProducts(limit * 2);
        confidence = 0.72;
        reason = RecommendationReason.HIGH_CLICKS;
        isFallback = true;
        source = RecommendationSource.ONLINE;
      }

      if (candidates.length === 0) {
        return emptyResult;
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.7,
        distance: 0.3,
        affinity: 0,
        freshness: 0
      });

      const processedProducts = this.postProcessor.process(ranked, limit);

      return {
        products: processedProducts,
        metadata: {
          confidence,
          reason,
          source,
          fallbackUsed: isFallback,
          retrievedCandidates: candidates.length,
          returnedProducts: processedProducts.length
        }
      };
    } catch (error) {
      this.logger.error(`Error in BestSellingStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class TrendingStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(TrendingStrategy.name);
  readonly key = 'trending';
  readonly cacheTTL = 3600;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: { confidence: 0, reason: RecommendationReason.OFFLINE_TRENDING, source: RecommendationSource.OFFLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    try {
      const limit = context.limit || 10;
      
      const geohash = 'global';
      
      let confidence = 0.97;
      let reason = RecommendationReason.OFFLINE_TRENDING;
      let isFallback = false;
      let source = RecommendationSource.OFFLINE;

      let candidates = await this.candidateRetriever.findOfflineCollection(
        'trending_products', 
        { $or: [{ geohash }, { geohash: { $exists: false } }] }, 
        limit * 2
      );

      if (candidates.length === 0) {
        this.logger.debug(`Trending offline collection empty, falling back to popular products.`);
        candidates = await this.candidateRetriever.findPopularProducts(limit * 2);
        confidence = 0.78;
        reason = RecommendationReason.POPULAR_PRODUCTS;
        isFallback = true;
        source = RecommendationSource.ONLINE;
      }

      if (candidates.length === 0) {
        this.logger.debug(`Popular products empty, falling back to recent products.`);
        candidates = await this.candidateRetriever.findRecentProducts(14, limit * 2);
        confidence = 0.61;
        reason = RecommendationReason.RECENT_PRODUCTS;
        isFallback = true;
        source = RecommendationSource.ONLINE;
      }

      if (candidates.length === 0) {
        return emptyResult;
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank prioritizing popularity and freshness
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.6,
        freshness: 0.2,
        distance: 0.2,
        affinity: 0
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
      this.logger.error(`Error in TrendingStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}

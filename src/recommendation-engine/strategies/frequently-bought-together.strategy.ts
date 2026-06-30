import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class FrequentlyBoughtTogetherStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(FrequentlyBoughtTogetherStrategy.name);
  readonly key = 'frequently_bought_together';
  readonly cacheTTL = 3600;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    if (!context.productId) {
      this.logger.debug('No productId provided for FBT');
      return [];
    }

    try {
      const limit = context.limit || 10;
      
      // Fetch offline recommendations generated for this specific product
      const candidates = await this.candidateRetriever.findOfflineCollection(
        'product_relationships', 
        { sourceProductId: context.productId, relationshipType: 'fbt' }, 
        limit * 2
      );

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank by popularity mainly
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.8,
        distance: 0.2,
        affinity: 0,
        freshness: 0
      });

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in FrequentlyBoughtTogetherStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

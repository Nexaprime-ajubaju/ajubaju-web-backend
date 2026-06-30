import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class BestSellingStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(BestSellingStrategy.name);
  readonly key = 'best_sellers';
  readonly cacheTTL = 3600; // 1 hour (offline job runs periodically)

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    try {
      const limit = context.limit || 10;
      
      const candidates = await this.candidateRetriever.findOfflineCollection('best_sellers', {}, limit * 2);

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.7,
        distance: 0.3,
        affinity: 0,
        freshness: 0
      });

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in BestSellingStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

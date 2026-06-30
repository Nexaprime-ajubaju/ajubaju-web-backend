import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class NewArrivalsStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(NewArrivalsStrategy.name);
  readonly key = 'new_arrivals';
  readonly cacheTTL = 600; // 10 mins

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    try {
      const limit = context.limit || 10;
      
      // Fetch products created in the last 14 days
      const candidates = await this.candidateRetriever.findRecentProducts(14, limit * 2);

      if (candidates.length === 0) {
        return [];
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

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in NewArrivalsStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class FlashDealsStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(FlashDealsStrategy.name);
  readonly key = 'flash_deals';
  readonly cacheTTL = 300;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    try {
      const limit = context.limit || 10;
      
      const candidates = await this.candidateRetriever.findDiscounted(limit * 2);

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank by discount (assuming we add discount component or just popularity for now)
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.6,
        freshness: 0.4,
        affinity: 0,
        distance: 0
      });

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in FlashDealsStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

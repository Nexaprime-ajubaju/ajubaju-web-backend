import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';
import { SeasonResolverService } from './season-resolver.service';

@Injectable()
export class SeasonalStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(SeasonalStrategy.name);
  readonly key = 'seasonal';
  readonly cacheTTL = 3600; // 1 hour

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
    private readonly seasonResolver: SeasonResolverService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    try {
      const limit = context.limit || 10;
      
      const tags = this.seasonResolver.getCurrentTags();
      
      const candidates = await this.candidateRetriever.findByTags(tags, limit * 2);

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank by popularity mainly
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.8,
        freshness: 0.2,
        affinity: 0,
        distance: 0
      });

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in SeasonalStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

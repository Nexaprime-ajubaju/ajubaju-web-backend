import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class CollaborativeStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(CollaborativeStrategy.name);
  readonly key = 'similar_customers';
  readonly cacheTTL = 3600;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    if (!context.userId) return [];
    
    try {
      const limit = context.limit || 10;
      
      // Fetch offline recommendations generated for this specific user
      const candidates = await this.candidateRetriever.findOfflineCollection(
        'similar_customers', 
        { userId: context.userId }, 
        limit * 2
      );

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank based on offline collaborative scores if available, or fallback to popularity/affinity
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.5,
        affinity: 0.5,
        distance: 0,
        freshness: 0
      });

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in CollaborativeStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

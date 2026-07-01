import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class CollaborativeStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(CollaborativeStrategy.name);
  readonly key = 'similar_customers';
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
      metadata: { confidence: 0, reason: RecommendationReason.COLLABORATIVE_FILTERING, source: RecommendationSource.OFFLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    if (!context.userId) return emptyResult;
    
    try {
      const limit = context.limit || 10;
      
      // Fetch offline recommendations generated for this specific user
      let candidates = await this.candidateRetriever.findOfflineCollection(
        'similar_customers', 
        { userId: context.userId }, 
        limit * 2
      );

      if (candidates.length === 0) {
        this.logger.debug(`Similar customers offline collection empty for ${context.userId}`);
        return emptyResult;
      }

      // Base confidence on the similarity score if present, else default high confidence
      const highestSimilarity = candidates[0].similarity || candidates[0].score || 0.85;
      const confidence = Math.min(1.0, Math.max(0.1, highestSimilarity));

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank based on offline collaborative scores if available, or fallback to popularity/affinity
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        popularity: 0.5,
        affinity: 0.5,
        distance: 0,
        freshness: 0
      });

      const processedProducts = this.postProcessor.process(ranked, limit);

      return {
        products: processedProducts,
        metadata: {
          confidence,
          reason: RecommendationReason.COLLABORATIVE_FILTERING,
          source: RecommendationSource.OFFLINE,
          fallbackUsed: false,
          retrievedCandidates: candidates.length,
          returnedProducts: processedProducts.length
        }
      };
    } catch (error) {
      this.logger.error(`Error in CollaborativeStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}

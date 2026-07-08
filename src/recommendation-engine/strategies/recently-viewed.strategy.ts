import { Injectable, Logger } from '@nestjs/common';
import {
  RecommendationStrategy,
  StrategyResult,
  RecommendationReason,
  RecommendationSource,
} from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { PostProcessorService } from '../ranking/post-processor.service';

@Injectable()
export class RecentlyViewedStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(RecentlyViewedStrategy.name);
  readonly key = 'recently_viewed';
  readonly cacheTTL = 0; // Don't cache recently viewed to keep it fresh
  readonly requiresUser = true;

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly postProcessor: PostProcessorService,
  ) {}

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: {
        confidence: 0,
        reason: RecommendationReason.USER_HISTORY,
        source: RecommendationSource.ONLINE,
        retrievedCandidates: 0,
        returnedProducts: 0,
      },
    };

    try {
      if (!context.userId) {
        return emptyResult;
      }

      const limit = context.limit || 10;

      const query = {
        status: { $in: ['approved', 'active'] },
        viewHistory: context.userId,
      };

      const totalViews =
        await this.candidateRetriever['offerModel'].countDocuments(query);
      if (totalViews === 0) return emptyResult;

      const confidence = 1.0;

      const candidates = await this.candidateRetriever['offerModel']
        .find(query)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select(this.candidateRetriever['baseSelect'])
        .lean();

      if (candidates.length === 0) return emptyResult;

      const candidatesWithScore = candidates.map((product, index) => ({
        product,
        finalScore: limit - index, // Simple score based on order (most recent first)
        components: { recency: limit - index },
        reasons: ['Recently viewed'],
      }));

      const processedProducts = this.postProcessor.process(
        candidatesWithScore,
        limit,
      );

      return {
        products: processedProducts,
        metadata: {
          confidence,
          reason: RecommendationReason.USER_HISTORY,
          source: RecommendationSource.ONLINE,
          fallbackUsed: false,
          retrievedCandidates: candidates.length,
          returnedProducts: processedProducts.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error in RecentlyViewedStrategy: ${error.message}`,
        error.stack,
      );
      return emptyResult;
    }
  }
}

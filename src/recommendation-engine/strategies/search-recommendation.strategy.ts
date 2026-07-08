import { Injectable } from '@nestjs/common';
import {
  RecommendationStrategy,
  StrategyResult,
  RecommendationReason,
  RecommendationSource,
} from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';

@Injectable()
export class SearchRecommendationStrategy implements RecommendationStrategy {
  readonly key = 'ai_search_recommendation';

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    const limit = context.limit || 10;
    // Placeholder implementation for SearchRecommendationStrategy
    // In a real implementation, this would inject required services (Users, Orders, Products)
    // and execute the algorithm (e.g. 40% distance, 30% rating, etc.)
    const mockProducts = [
      {
        id: 'ai_search_recommendation-mock-1',
        title: 'Mock Item 1 for SearchRecommendationStrategy',
        type: 'product',
      },
      {
        id: 'ai_search_recommendation-mock-2',
        title: 'Mock Item 2 for SearchRecommendationStrategy',
        type: 'product',
      },
    ].slice(0, limit);

    return {
      products: mockProducts,
      metadata: {
        confidence: 0.5,
        reason: RecommendationReason.MIXED_SIGNALS,
        source: RecommendationSource.ONLINE,
        fallbackUsed: false,
        retrievedCandidates: mockProducts.length,
        returnedProducts: mockProducts.length,
      },
    };
  }
}

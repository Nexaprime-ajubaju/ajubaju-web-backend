import { Injectable } from '@nestjs/common';
import {
  RecommendationStrategy,
  StrategyResult,
  RecommendationReason,
  RecommendationSource,
} from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';

@Injectable()
export class FrequentlyBoughtStrategy implements RecommendationStrategy {
  readonly key = 'frequently_bought_together';

  getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const limit = context.limit || 10;
    // Placeholder implementation for FrequentlyBoughtStrategy
    // In a real implementation, this would inject required services (Users, Orders, Products)
    // and execute the algorithm (e.g. 40% distance, 30% rating, etc.)
    const mockProducts = [
      {
        id: 'frequently_bought_together-mock-1',
        title: 'Mock Item 1 for FrequentlyBoughtStrategy',
        type: 'product',
      },
      {
        id: 'frequently_bought_together-mock-2',
        title: 'Mock Item 2 for FrequentlyBoughtStrategy',
        type: 'product',
      },
    ].slice(0, limit);

    return Promise.resolve({
      products: mockProducts,
      metadata: {
        confidence: 0.5,
        reason: RecommendationReason.MIXED_SIGNALS,
        source: RecommendationSource.ONLINE,
        fallbackUsed: false,
        retrievedCandidates: mockProducts.length,
        returnedProducts: mockProducts.length,
      },
    });
  }
}

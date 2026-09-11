import { Injectable } from '@nestjs/common';
import {
  RecommendationStrategy,
  StrategyResult,
  RecommendationReason,
  RecommendationSource,
} from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';

@Injectable()
export class PromotionStrategy implements RecommendationStrategy {
  readonly key = 'merchant_promotions';

  getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const limit = context.limit || 10;
    // Placeholder implementation for PromotionStrategy
    // In a real implementation, this would inject required services (Users, Orders, Products)
    // and execute the algorithm (e.g. 40% distance, 30% rating, etc.)
    const mockProducts = [
      {
        id: 'merchant_promotions-mock-1',
        title: 'Mock Item 1 for PromotionStrategy',
        type: 'product',
      },
      {
        id: 'merchant_promotions-mock-2',
        title: 'Mock Item 2 for PromotionStrategy',
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

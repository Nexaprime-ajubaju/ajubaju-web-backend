import { Injectable } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';

@Injectable()
export class PromotionStrategy implements RecommendationStrategy {
  readonly key = 'merchant_promotions';

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    const limit = context.limit || 10;
    // Placeholder implementation for PromotionStrategy
    // In a real implementation, this would inject required services (Users, Orders, Products)
    // and execute the algorithm (e.g. 40% distance, 30% rating, etc.)
    return [
      {
        id: 'merchant_promotions-mock-1',
        title: 'Mock Item 1 for PromotionStrategy',
        type: 'product',
      },
      {
        id: 'merchant_promotions-mock-2',
        title: 'Mock Item 2 for PromotionStrategy',
        type: 'product',
      }
    ].slice(0, limit);
  }
}

import { Injectable } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';

@Injectable()
export class RecentlyViewedStrategy implements RecommendationStrategy {
  readonly key = 'continue_shopping';

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    const limit = context.limit || 10;
    // Placeholder implementation for RecentlyViewedStrategy
    // In a real implementation, this would inject required services (Users, Orders, Products)
    // and execute the algorithm (e.g. 40% distance, 30% rating, etc.)
    return [
      {
        id: 'continue_shopping-mock-1',
        title: 'Mock Item 1 for RecentlyViewedStrategy',
        type: 'product',
      },
      {
        id: 'continue_shopping-mock-2',
        title: 'Mock Item 2 for RecentlyViewedStrategy',
        type: 'product',
      }
    ].slice(0, limit);
  }
}

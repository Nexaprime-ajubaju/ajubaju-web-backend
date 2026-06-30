import { Injectable } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';

@Injectable()
export class SearchRecommendationStrategy implements RecommendationStrategy {
  readonly key = 'ai_search_recommendation';

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    const limit = context.limit || 10;
    // Placeholder implementation for SearchRecommendationStrategy
    // In a real implementation, this would inject required services (Users, Orders, Products)
    // and execute the algorithm (e.g. 40% distance, 30% rating, etc.)
    return [
      {
        id: 'ai_search_recommendation-mock-1',
        title: 'Mock Item 1 for SearchRecommendationStrategy',
        type: 'product',
      },
      {
        id: 'ai_search_recommendation-mock-2',
        title: 'Mock Item 2 for SearchRecommendationStrategy',
        type: 'product',
      }
    ].slice(0, limit);
  }
}

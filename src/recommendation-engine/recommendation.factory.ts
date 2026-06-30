import { Injectable, Inject } from '@nestjs/common';
import { RecommendationStrategy } from './interfaces/recommendation-strategy.interface';

export const RECOMMENDATION_STRATEGIES = 'RECOMMENDATION_STRATEGIES';

@Injectable()
export class RecommendationFactory {
  private strategyMap = new Map<string, RecommendationStrategy>();

  constructor(
    @Inject(RECOMMENDATION_STRATEGIES) private strategies: RecommendationStrategy[]
  ) {
    this.strategies.forEach(s => {
      this.strategyMap.set(s.key, s);
    });
  }

  get(key: string): RecommendationStrategy {
    const strategy = this.strategyMap.get(key);
    if (!strategy) {
      throw new Error(`Strategy with key ${key} not found.`);
    }
    return strategy;
  }
}

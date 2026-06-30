import { Injectable, OnModuleInit } from '@nestjs/common';
import { RankingComponent, RankingComponentContext, RankingComponentResult } from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class PopularityComponent implements RankingComponent, OnModuleInit {
  readonly key = 'popularity';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;
    const score = feature.popularityScore || 0;

    return {
      score,
      reason: score > 0.8 ? 'Popular in your area' : undefined
    };
  }
}

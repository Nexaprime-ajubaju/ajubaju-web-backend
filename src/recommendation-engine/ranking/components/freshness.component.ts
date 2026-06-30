import { Injectable, OnModuleInit } from '@nestjs/common';
import { RankingComponent, RankingComponentContext, RankingComponentResult } from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class FreshnessComponent implements RankingComponent, OnModuleInit {
  readonly key = 'freshness';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;
    const score = feature.freshnessScore || 0;

    return {
      score,
      reason: score > 0.9 ? 'New arrival' : undefined
    };
  }
}

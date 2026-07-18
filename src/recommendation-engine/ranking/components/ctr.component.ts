import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RankingComponent,
  RankingComponentContext,
  RankingComponentResult,
} from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class CtrComponent implements RankingComponent, OnModuleInit {
  readonly key = 'ctr';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;

    // Assume max reasonable CTR is 10% (0.1) for normalization
    let score = (feature.ctr || 0) / 0.1;
    if (score > 1.0) score = 1.0;

    return {
      score,
      reason: score > 0.8 ? 'Highly clicked' : undefined,
    };
  }
}

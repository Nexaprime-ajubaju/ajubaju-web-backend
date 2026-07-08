import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RankingComponent,
  RankingComponentContext,
  RankingComponentResult,
} from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class ConversionComponent implements RankingComponent, OnModuleInit {
  readonly key = 'conversion';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;

    // Assume max reasonable CVR is 5% (0.05) for normalization
    let score = (feature.conversionRate || 0) / 0.05;
    if (score > 1.0) score = 1.0;

    return {
      score,
      reason: score > 0.8 ? 'Highly purchased' : undefined,
    };
  }
}

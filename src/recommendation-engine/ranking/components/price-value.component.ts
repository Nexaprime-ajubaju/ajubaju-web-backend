import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RankingComponent,
  RankingComponentContext,
  RankingComponentResult,
} from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class PriceValueComponent implements RankingComponent, OnModuleInit {
  readonly key = 'price_value';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;

    // Combine price competitiveness with discount quality
    const compScore = feature.priceCompetitiveness || 0;
    const discountScore = feature.discountQuality || 0;

    const score = compScore * 0.6 + discountScore * 0.4;

    return {
      score,
      reason: score > 0.8 ? 'Great value' : undefined,
    };
  }
}

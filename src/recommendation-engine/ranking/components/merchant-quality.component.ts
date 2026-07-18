import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RankingComponent,
  RankingComponentContext,
  RankingComponentResult,
} from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class MerchantQualityComponent
  implements RankingComponent, OnModuleInit
{
  readonly key = 'merchant_quality';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;

    // Combine rating (0-5) and fulfillment rate (0-1)
    const ratingScore = (feature.merchantRating || 0) / 5;
    const fulfillmentScore = feature.merchantFulfillmentRate || 0;

    const score = ratingScore * 0.6 + fulfillmentScore * 0.4;

    return {
      score,
      reason: score > 0.8 ? 'Top rated merchant' : undefined,
    };
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { RankingComponent, RankingComponentContext, RankingComponentResult } from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class InventoryComponent implements RankingComponent, OnModuleInit {
  readonly key = 'inventory';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { feature } = params;
    
    const score = feature.inventoryScore || 0;
    
    return { 
      score
    };
  }
}

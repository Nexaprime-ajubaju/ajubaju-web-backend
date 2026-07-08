import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RankingComponent,
  RankingComponentContext,
  RankingComponentResult,
} from './ranking-component.interface';
import { RankingComponentRegistry } from '../ranking-component.registry';

@Injectable()
export class AffinityComponent implements RankingComponent, OnModuleInit {
  readonly key = 'affinity';

  constructor(private readonly registry: RankingComponentRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculate(params: RankingComponentContext): RankingComponentResult {
    const { candidate, profile } = params;

    if (!profile) {
      return { score: 0 };
    }

    let score = 0;
    const matchedCategories: string[] = [];
    const matchedTags: string[] = [];

    if (candidate.category && profile.categories[candidate.category]) {
      const catScore = profile.categories[candidate.category];
      if (catScore > score) {
        score = catScore;
      }
      matchedCategories.push(candidate.category);
    }

    if (candidate.tags) {
      candidate.tags.forEach((tag: string) => {
        if (profile.tags[tag]) {
          const tagScore = profile.tags[tag];
          if (tagScore > score) {
            score = tagScore;
          }
          matchedTags.push(tag);
        }
      });
    }

    return {
      score,
      reason: score > 0.5 ? 'Matches your interests' : undefined,
      matchedCategories:
        matchedCategories.length > 0 ? matchedCategories : undefined,
      matchedTags: matchedTags.length > 0 ? matchedTags : undefined,
    };
  }
}

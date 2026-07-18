import { Injectable, Logger, Inject } from '@nestjs/common';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { ProductFeature } from '../../feature-store/product/product-feature.schema';
import { BlendedInterestProfile } from '../../analytics/profile-blender.service';
import { RankingComponent } from './components/ranking-component.interface';
import { RankingComponentRegistry } from './ranking-component.registry';
import { RankingConfigService } from './ranking-config.service';

export interface RankingWeights {
  affinity: number;
  distance: number;
  popularity: number;
  freshness: number;
  [key: string]: number;
}

export interface CandidateWithScore {
  product: any;
  finalScore: number;
  components: Record<string, number>;
  matchedTags?: string[];
  matchedCategories?: string[];
  policyAdjustments?: string[];
  reasons: string[];
}

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private readonly componentRegistry: RankingComponentRegistry,
    private readonly rankingConfigService: RankingConfigService,
  ) {}

  rankCandidates(
    candidates: any[],
    features: Record<string, ProductFeature>,
    context: RecommendationContext,
    profile?: BlendedInterestProfile | null,
    customWeights?: Partial<RankingWeights>,
  ): CandidateWithScore[] {
    const variantConfig = this.rankingConfigService.getConfig(
      context.experimentVariant || 'default',
    );
    const weights = { ...variantConfig, ...customWeights };

    const scored = candidates.map((product) => {
      const productId = product._id.toString();
      const feature = features[productId] || ({} as Partial<ProductFeature>);

      let finalScore = 0;
      const componentScores: Record<string, number> = {};
      const reasons: string[] = [];
      let matchedTags: string[] = [];
      let matchedCategories: string[] = [];
      const components = this.componentRegistry.getAll();

      for (const component of components) {
        const result = component.calculate({
          candidate: product,
          feature,
          context,
          profile,
        });
        const weight = weights[component.key] || 0;

        const weightedScore = result.score * weight;
        finalScore += weightedScore;
        componentScores[component.key] = Math.round(result.score * 100) / 100;

        if (result.reason) reasons.push(result.reason);
        if (result.matchedTags) matchedTags.push(...result.matchedTags);
        if (result.matchedCategories)
          matchedCategories.push(...result.matchedCategories);
      }

      return {
        product,
        finalScore: Math.round(finalScore * 100) / 100,
        components: componentScores,
        matchedTags:
          matchedTags.length > 0 ? Array.from(new Set(matchedTags)) : undefined,
        matchedCategories:
          matchedCategories.length > 0
            ? Array.from(new Set(matchedCategories))
            : undefined,
        reasons,
        policyAdjustments: [],
      };
    });

    // Sort descending by finalScore
    scored.sort((a, b) => b.finalScore - a.finalScore);

    return scored;
  }
}

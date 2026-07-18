import { RecommendationContext } from '../../interfaces/recommendation.context';
import { ProductFeature } from '../../../feature-store/product/product-feature.schema';
import { BlendedInterestProfile } from '../../../analytics/profile-blender.service';

export interface RankingComponentContext {
  candidate: any;
  feature: Partial<ProductFeature>;
  context: RecommendationContext;
  profile?: BlendedInterestProfile | null;
}

export interface RankingComponentResult {
  score: number; // 0 to 1
  reason?: string;
  matchedTags?: string[];
  matchedCategories?: string[];
}

export interface RankingComponent {
  readonly key: string;
  calculate(params: RankingComponentContext): RankingComponentResult;
}

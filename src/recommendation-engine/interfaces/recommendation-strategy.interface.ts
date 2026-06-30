import { RecommendationContext } from './recommendation.context';
import { RecommendationSectionDto } from '../dto/recommendation-section.dto';

export interface RecommendationStrategy {
  key: string;
  priority?: number;
  cacheTTL?: number; // TTL in seconds
  requiresLocation?: boolean;
  
  getRecommendations(context: RecommendationContext): Promise<any[]>;
}

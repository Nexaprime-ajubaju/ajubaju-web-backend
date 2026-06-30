import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { MerchantRepository } from '../repositories/merchant.repository';
import { NearbyScorer } from '../scorers/nearby.scorer';

@Injectable()
export class NearbyStrategy implements RecommendationStrategy {
  readonly key = 'nearby_you';
  readonly priority = 1;
  readonly cacheTTL = 300;
  readonly requiresLocation = true;
  private readonly logger = new Logger(NearbyStrategy.name);

  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly nearbyScorer: NearbyScorer
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    try {
      // 1. Fetch from repository
      const rawMerchants = await this.merchantRepository.findNearby(context);

      // 2. Score merchants
      const scoredMerchants = this.nearbyScorer.score(rawMerchants);

      // 3. Sort by final score descending
      scoredMerchants.sort((a, b) => b.finalScore - a.finalScore);

      // 4. Limit and map to DTO format
      const limit = context.limit || 10;
      return scoredMerchants.slice(0, limit).map(m => ({
        id: m._id || m.id,
        title: m.name || m.businessName || 'Unknown Merchant',
        type: 'merchant',
        distance: m.calculatedDistance ? Math.round(m.calculatedDistance) : undefined,
        rating: m.rating || m.averageRating,
        thumbnail: m.logo || m.coverImage,
        score: m.finalScore
      }));
    } catch (error) {
      this.logger.error(`Error in NearbyStrategy: ${error.message}`, error.stack);
      throw error;
    }
  }
}

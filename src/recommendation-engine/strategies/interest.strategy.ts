import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from './recommendation.strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { ProfileBlenderService } from '../../analytics/profile-blender.service';
import { RecommendationFactory } from '../recommendation.factory';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';

@Injectable()
export class InterestStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(InterestStrategy.name);
  readonly key = 'interest';
  readonly cacheTTL = 300; // 5 minutes

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly profileBlender: ProfileBlenderService,
    private readonly factory: RecommendationFactory,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    if (!context.userId) {
      this.logger.debug('No userId provided, falling back to NearbyStrategy');
      return this.fallback(context);
    }

    const profile = await this.profileBlender.getBlendedProfile(context.userId);
    
    // Cold Start / Cache Miss Check
    if (!profile) {
      this.logger.debug(`Profile cache miss for ${context.userId}, triggering background rebuild and falling back`);
      // Trigger background rebuild
      this.profileBlender.blendAndCache(context.userId).catch(err => 
        this.logger.error(`Background profile rebuild failed: ${err.message}`)
      );
      return this.fallback(context);
    }

    if (profile.confidence < 0.3) {
      this.logger.debug(`Confidence too low (${profile.confidence}), falling back to NearbyStrategy`);
      return this.fallback(context);
    }

    // Get Top Categories (Score > 0.5)
    const topCategories = Object.entries(profile.categories)
      .filter(([_, score]) => score >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 3); // Top 3

    // Get Top Tags (Score > 0.5)
    const topTags = Object.entries(profile.tags)
      .filter(([_, score]) => score >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 5); // Top 5

    if (topCategories.length === 0 && topTags.length === 0) {
      return this.fallback(context);
    }

    // 1. Retrieve Candidates with progressive expansion
    const candidates = await this.candidateRetriever.findCandidates(
      topCategories, 
      topTags, 
      context,
      { minCandidates: 30, maxCandidates: 100, radii: [5, 10, 20] }
    );

    if (candidates.length === 0) {
      return this.fallback(context);
    }

    // 2. Fetch Features
    const productIds = candidates.map(c => c._id.toString());
    const features = await this.featureStore.getFeatures(productIds);

    // 3. Rank Candidates
    const ranked = this.rankingService.rankCandidates(candidates, features, context, profile);

    // 4. Post-Process (Diversity & Rules)
    const finalResults = this.postProcessor.process(ranked, 15);

    if (finalResults.length === 0) {
      return this.fallback(context);
    }

    return finalResults;
  }

  private async fallback(context: RecommendationContext): Promise<any[]> {
    const nearbyStrategy = this.factory.get('nearby');
    if (nearbyStrategy) {
      return nearbyStrategy.getRecommendations(context);
    }
    return [];
  }
}


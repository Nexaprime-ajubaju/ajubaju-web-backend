import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RecommendationStrategy, StrategyResult, RecommendationReason, RecommendationSource } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { ProfileBlenderService } from '../../analytics/profile-blender.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';

@Injectable()
export class InterestStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(InterestStrategy.name);
  readonly key = 'interest';
  readonly cacheTTL = 300; // 5 minutes

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly profileBlender: ProfileBlenderService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: { confidence: 0, reason: RecommendationReason.MIXED_SIGNALS, source: RecommendationSource.ONLINE, retrievedCandidates: 0, returnedProducts: 0 }
    };

    if (!context.userId) {
      this.logger.debug('No userId provided, returning empty list for interest');
      return emptyResult;
    }

    try {
      const profile = await this.profileBlender.getBlendedProfile(context.userId);
      
      // Cold Start / Cache Miss Check
      if (!profile) {
        this.logger.debug(`Profile cache miss for ${context.userId}, triggering background rebuild and returning empty`);
        // Trigger background rebuild
        this.profileBlender.blendAndCache(context.userId).catch(err => 
          this.logger.error(`Background profile rebuild failed: ${err.message}`)
        );
        return emptyResult;
      }

      if (profile.confidence < 0.3) {
        this.logger.debug(`Confidence too low (${profile.confidence}), returning empty`);
        return emptyResult;
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
        return emptyResult;
      }

      // 1. Retrieve Candidates with progressive expansion
      const candidates = await this.candidateRetriever.findCandidates(
        topCategories, 
        topTags, 
        context,
        { minCandidates: 30, maxCandidates: 100, radii: [5, 10, 20] }
      );

      if (candidates.length === 0) {
        return emptyResult;
      }

      // 2. Fetch Features
      const productIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(productIds);

      // 3. Rank Candidates
      const ranked = this.rankingService.rankCandidates(candidates, features, context, profile);

      // 4. Post-Process (Diversity & Rules)
      const finalResults = this.postProcessor.process(ranked, 15);

      if (finalResults.length === 0) {
        return emptyResult;
      }

      return {
        products: finalResults,
        metadata: {
          confidence: profile.confidence,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          fallbackUsed: false,
          retrievedCandidates: candidates.length,
          returnedProducts: finalResults.length
        }
      };
    } catch (error) {
      this.logger.error(`Error in InterestStrategy: ${error.message}`, error.stack);
      return emptyResult;
    }
  }
}


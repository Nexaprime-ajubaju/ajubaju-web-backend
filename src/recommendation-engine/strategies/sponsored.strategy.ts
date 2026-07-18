import { Injectable, Logger } from '@nestjs/common';
import {
  RecommendationStrategy,
  StrategyResult,
  RecommendationReason,
  RecommendationSource,
} from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { ProductFeatureService } from '../../feature-store/product/product-feature.service';

@Injectable()
export class SponsoredStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(SponsoredStrategy.name);
  readonly key = 'sponsored';
  readonly cacheTTL = 60; // 1 min

  constructor(
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    try {
      const limit = context.limit || 10;
      const MAX_SPONSORED = 2;

      // Fetch sponsored pool
      const sponsoredCandidates =
        await this.candidateRetriever.findSponsored(10);

      let sponsoredRanked = [];
      if (sponsoredCandidates.length > 0) {
        const sponsoredIds = sponsoredCandidates.map((c) => c._id.toString());
        const sponsoredFeatures =
          await this.featureStore.getFeatures(sponsoredIds);

        sponsoredRanked = this.rankingService.rankCandidates(
          sponsoredCandidates,
          sponsoredFeatures,
          context,
          null,
          {
            popularity: 0.5,
            freshness: 0.5,
            affinity: 0,
            distance: 0,
          },
        );

        sponsoredRanked = this.postProcessor.process(
          sponsoredRanked,
          MAX_SPONSORED,
        );
        // Mark them as sponsored in the output
        sponsoredRanked.forEach((item) => (item.product.isSponsored = true));
      }

      // Fetch organic pool to mix in
      const organicNeeded = limit - sponsoredRanked.length;
      let organicRanked = [];

      if (organicNeeded > 0) {
        // Fallback to best sellers for organic mix
        const organicCandidates =
          await this.candidateRetriever.findOfflineCollection(
            'best_sellers',
            {},
            organicNeeded * 2,
          );

        if (organicCandidates.length > 0) {
          const organicIds = organicCandidates.map((c) => c._id.toString());
          const organicFeatures =
            await this.featureStore.getFeatures(organicIds);

          organicRanked = this.rankingService.rankCandidates(
            organicCandidates,
            organicFeatures,
            context,
            null,
            {
              popularity: 0.8,
              distance: 0.2,
              affinity: 0,
              freshness: 0,
            },
          );

          organicRanked = this.postProcessor.process(
            organicRanked,
            organicNeeded,
          );
        }
      }

      // Mix them: Sponsored at positions 0 and 4 (if available)
      const finalResults = [];
      let sIdx = 0;
      let oIdx = 0;

      for (let i = 0; i < limit; i++) {
        if (i === 0 && sIdx < sponsoredRanked.length) {
          finalResults.push(sponsoredRanked[sIdx++]);
        } else if (i === 3 && sIdx < sponsoredRanked.length) {
          // 4th slot
          finalResults.push(sponsoredRanked[sIdx++]);
        } else if (oIdx < organicRanked.length) {
          finalResults.push(organicRanked[oIdx++]);
        } else if (sIdx < sponsoredRanked.length) {
          // If we run out of organic, just append any remaining sponsored
          finalResults.push(sponsoredRanked[sIdx++]);
        }
      }

      return {
        products: finalResults,
        metadata: {
          confidence: 0.5,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          retrievedCandidates: finalResults.length,
          returnedProducts: finalResults.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error in SponsoredStrategy: ${error.message}`,
        error.stack,
      );
      return {
        products: [],
        metadata: {
          confidence: 0,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          retrievedCandidates: 0,
          returnedProducts: 0,
        },
      };
    }
  }
}

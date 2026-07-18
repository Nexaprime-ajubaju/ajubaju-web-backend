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
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SimilarProduct,
  SimilarProductDocument,
} from '../offline-intelligence/schemas/similar-product.schema';

@Injectable()
export class SimilarProductsStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(SimilarProductsStrategy.name);
  readonly key = 'similar_products';
  readonly cacheTTL = 3600;

  constructor(
    @InjectModel(SimilarProduct.name)
    private readonly similarProductModel: Model<SimilarProductDocument>,
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    if (!context.productId) {
      this.logger.debug('No productId provided for similar_products');
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

    try {
      const limit = context.limit || 10;

      // Fetch pre-computed offline similarities
      const similarRecords = await this.similarProductModel
        .find({
          productId: new Types.ObjectId(context.productId),
        })
        .sort({ similarityScore: -1 })
        .limit(limit * 2)
        .lean();

      if (similarRecords.length === 0) {
        this.logger.debug(
          `Similar products offline collection empty for ${context.productId}, falling back to category match.`,
        );
        const originalProduct = (
          await this.candidateRetriever.findByProductIds([context.productId], 1)
        )[0];
        if (originalProduct && originalProduct.category) {
          const fallbackCandidates =
            await this.candidateRetriever.findByCategories(
              [originalProduct.category],
              limit * 2,
            );
          const filtered = fallbackCandidates.filter(
            (c) => c._id.toString() !== context.productId,
          );

          if (filtered.length > 0) {
            const candidateIds = filtered.map((c) => c._id.toString());
            const features = await this.featureStore.getFeatures(candidateIds);
            const ranked = this.rankingService.rankCandidates(
              filtered,
              features,
              context,
              null,
              {
                popularity: 0.5,
                distance: 0.5,
                affinity: 0,
                freshness: 0,
              },
            );
            const products = this.postProcessor.process(ranked, limit);
            return {
              products,
              metadata: {
                confidence: 0.5,
                reason: RecommendationReason.MIXED_SIGNALS,
                source: RecommendationSource.ONLINE,
                retrievedCandidates: products.length,
                returnedProducts: products.length,
              },
            };
          }
        }
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

      const similarProductIds = similarRecords.map((r) =>
        r.similarProductId.toString(),
      );

      // Retrieve Candidates
      const candidates = await this.candidateRetriever.findByProductIds(
        similarProductIds,
        limit * 2,
      );

      if (candidates.length === 0) {
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

      const candidateIds = candidates.map((c) => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Inject the offline similarity score as affinity proxy
      candidates.forEach((c) => {
        const record = similarRecords.find(
          (r) => r.similarProductId.toString() === c._id.toString(),
        );
        c.__similarityScore = record ? record.similarityScore : 0;
      });

      // Rank prioritizing the similarity score
      const ranked = this.rankingService.rankCandidates(
        candidates,
        features,
        context,
        null,
        {
          affinity: 0.8, // Using affinity component space for similarity score
          popularity: 0.1,
          distance: 0.1,
          freshness: 0,
        },
      );

      // Override affinity component visually
      for (const r of ranked) {
        const similarityScore = r.product.__similarityScore || 0;
        r.finalScore = similarityScore * 0.8 + r.finalScore * 0.2;
        r.components['affinity'] = similarityScore; // Make it explainable
      }

      ranked.sort((a, b) => b.finalScore - a.finalScore);

      const products = this.postProcessor.process(ranked, limit);
      return {
        products,
        metadata: {
          confidence: 0.5,
          reason: RecommendationReason.MIXED_SIGNALS,
          source: RecommendationSource.ONLINE,
          retrievedCandidates: products.length,
          returnedProducts: products.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error in SimilarProductsStrategy: ${error.message}`,
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

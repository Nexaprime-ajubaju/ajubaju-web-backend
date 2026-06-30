import { Injectable, Logger } from '@nestjs/common';
import { RecommendationStrategy } from '../interfaces/recommendation-strategy.interface';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { CandidateRetrieverService } from '../retrievers/candidate-retriever.service';
import { RankingService } from '../ranking/ranking.service';
import { PostProcessorService } from '../ranking/post-processor.service';
import { FeatureStoreService } from '../../feature-store/product/product-feature.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SimilarProduct, SimilarProductDocument } from '../offline-intelligence/schemas/similar-product.schema';

@Injectable()
export class SimilarProductsStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(SimilarProductsStrategy.name);
  readonly key = 'similar_products';
  readonly cacheTTL = 3600;

  constructor(
    @InjectModel(SimilarProduct.name) private readonly similarProductModel: Model<SimilarProductDocument>,
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: FeatureStoreService,
  ) {}

  async getRecommendations(context: RecommendationContext): Promise<any[]> {
    if (!context.productId) {
      this.logger.debug('No productId provided for similar_products');
      return [];
    }

    try {
      const limit = context.limit || 10;
      
      // Fetch pre-computed offline similarities
      const similarRecords = await this.similarProductModel.find({ 
        productId: new Types.ObjectId(context.productId) 
      })
      .sort({ similarityScore: -1 })
      .limit(limit * 2)
      .lean();

      if (similarRecords.length === 0) {
        return [];
      }

      const similarProductIds = similarRecords.map(r => r.similarProductId.toString());
      
      // Retrieve Candidates
      const candidates = await this.candidateRetriever.findByProductIds(similarProductIds, limit * 2);

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map(c => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Inject the offline similarity score as affinity proxy
      candidates.forEach(c => {
        const record = similarRecords.find(r => r.similarProductId.toString() === c._id.toString());
        c.__similarityScore = record ? record.similarityScore : 0;
      });

      // Rank prioritizing the similarity score 
      const ranked = this.rankingService.rankCandidates(candidates, features, context, null, {
        affinity: 0.8, // Using affinity component space for similarity score
        popularity: 0.1,
        distance: 0.1,
        freshness: 0
      });

      // Override affinity component visually
      for (const r of ranked) {
        const similarityScore = r.product.__similarityScore || 0;
        r.finalScore = (similarityScore * 0.8) + (r.finalScore * 0.2); 
        r.components['affinity'] = similarityScore; // Make it explainable
      }
      
      ranked.sort((a, b) => b.finalScore - a.finalScore);

      return this.postProcessor.process(ranked, limit);
    } catch (error) {
      this.logger.error(`Error in SimilarProductsStrategy: ${error.message}`, error.stack);
      return [];
    }
  }
}

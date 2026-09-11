import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import {
  RecommendationEvent,
  RecommendationEventDocument,
} from '../../analytics/schemas/recommendation-event.schema';
import {
  OfferPromotion,
  OfferPromotionDocument,
} from '../../offers/schemas/offer-promotion.schema';

@Injectable()
export class RepeatPurchaseStrategy implements RecommendationStrategy {
  private readonly logger = new Logger(RepeatPurchaseStrategy.name);
  readonly key = 'repeat_purchase';
  readonly cacheTTL = 300;

  // Categories well-suited for repeat purchases
  private readonly HIGH_REPEAT_CATEGORIES = [
    'groceries',
    'medicine',
    'milk',
    'gas',
    'water',
    'pet food',
    'cosmetics',
    'baby care',
    'household',
    'subscriptions',
  ];
  // Categories NOT suited for repeat purchases
  private readonly LOW_REPEAT_CATEGORIES = [
    'phones',
    'cars',
    'furniture',
    'television',
    'laptop',
    'camera',
    'property',
  ];

  constructor(
    @InjectModel(RecommendationEvent.name)
    private readonly eventModel: Model<RecommendationEventDocument>,
    @InjectModel(OfferPromotion.name)
    private readonly offerModel: Model<OfferPromotionDocument>,
    private readonly candidateRetriever: CandidateRetrieverService,
    private readonly rankingService: RankingService,
    private readonly postProcessor: PostProcessorService,
    private readonly featureStore: ProductFeatureService,
  ) {}

  async getRecommendations(
    context: RecommendationContext,
  ): Promise<StrategyResult> {
    const emptyResult: StrategyResult = {
      products: [],
      metadata: {
        confidence: 0,
        reason: RecommendationReason.PREVIOUS_ORDERS,
        source: RecommendationSource.ONLINE,
        retrievedCandidates: 0,
        returnedProducts: 0,
      },
    };

    if (!context.userId) {
      return emptyResult;
    }

    try {
      const limit = context.limit || 10;

      // 1. Fetch events to figure out purchase/cart history
      // Since Orders schema lacks productIds, we use events with graceful fallback built-in.
      const events = await this.eventModel
        .find({
          userId: context.userId,
          productId: { $exists: true, $ne: null },
        })
        .select('productId eventType timestamp')
        .lean();

      if (events.length === 0) return emptyResult;

      const productStats: Record<
        string,
        { count: number; lastEvent: Date; score: number }
      > = {};

      for (const event of events) {
        if (!event.productId) continue;
        const pId = event.productId.toString();

        let weight = 0;
        switch (event.eventType) {
          case 'purchase':
            weight = 10;
            break;
          case 'add_to_cart':
            weight = 6;
            break;
          case 'wishlist':
            weight = 5;
            break;
          case 'click':
            weight = 3;
            break;
          case 'view':
            weight = 1;
            break;
        }

        if (!productStats[pId]) {
          productStats[pId] = {
            count: 0,
            lastEvent: event.createdAt,
            score: 0,
          };
        }

        productStats[pId].count += 1;
        productStats[pId].score += weight;

        if (new Date(event.createdAt) > new Date(productStats[pId].lastEvent)) {
          productStats[pId].lastEvent = event.createdAt;
        }
      }

      // Filter products based on category and compute final repeat score
      const productIds = Object.keys(productStats);
      if (productIds.length === 0) return emptyResult;

      // We need category info to adjust the score
      const productsMeta = await this.offerModel
        .find({ _id: { $in: productIds } })
        .select(
          '_id title originalPrice offerPrice selectedProducts category imageUrl merchantId',
        )
        .lean();

      const finalScores: Record<string, number> = {};
      const now = new Date().getTime();

      for (const meta of productsMeta) {
        const pId = meta._id.toString();
        const stats = productStats[pId];
        const category = meta.category?.toLowerCase() || '';

        // Discard low repeat items
        if (this.LOW_REPEAT_CATEGORIES.some((c) => category.includes(c))) {
          continue;
        }

        let categoryMultiplier = 1;
        if (this.HIGH_REPEAT_CATEGORIES.some((c) => category.includes(c))) {
          categoryMultiplier = 2; // Boost groceries, medicines, etc.
        }

        // Recency factor (older is slightly better for repeat purchases, but not too old)
        const daysSinceLastEvent =
          (now - new Date(stats.lastEvent).getTime()) / (1000 * 3600 * 24);

        // If it was bought yesterday, they probably don't need it today
        if (daysSinceLastEvent < 7) continue;

        // Boost if it's in the sweet spot (14-60 days)
        let recencyMultiplier = 1;
        if (daysSinceLastEvent >= 14 && daysSinceLastEvent <= 60) {
          recencyMultiplier = 1.5;
        }

        // Base score uses the frequency count and the signal weight
        finalScores[pId] = stats.score * categoryMultiplier * recencyMultiplier;
      }

      const sortedProductIds = Object.entries(finalScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map((entry) => entry[0]);

      if (sortedProductIds.length === 0) return emptyResult;

      const confidence = 1.0;

      // Retrieve Candidates
      const candidates = await this.candidateRetriever.findByProductIds(
        sortedProductIds,
        limit * 2,
        context.latitude && context.longitude
          ? { latitude: context.latitude, longitude: context.longitude }
          : undefined,
        20, // maxDistanceKm
      );

      if (candidates.length === 0) return emptyResult;

      const candidateIds = candidates.map((c) => c._id.toString());
      const features = await this.featureStore.getFeatures(candidateIds);

      // Rank prioritizing RepeatScore (injected as custom weight or mapped via affinity)
      // Since repeatScore isn't a native component, we map it into affinity weights or rely on the custom sorting.
      // We'll let RankingService handle standard factors and rely heavily on affinity.

      // To properly map the score, we can inject it into the product feature's affinity temporarily or
      // rely on the existing ranking logic. The user requested: RepeatScore 50%, Affinity 20%.
      // For MVP, we'll lean on the order we send to the ranking service, but RankingService re-sorts.
      // We will inject the score directly onto the object so a custom component could use it.
      candidates.forEach(
        (c) => (c.__repeatScore = finalScores[c._id.toString()]),
      );

      const ranked = this.rankingService.rankCandidates(
        candidates,
        features,
        context,
        null,
        {
          affinity: 0.5, // Used as a proxy
          distance: 0.2,
          popularity: 0.1,
          freshness: 0,
        },
      );

      // Override the finalScore using our repeatScore logic for this specific strategy
      for (const r of ranked) {
        const repeatScore = r.product.__repeatScore || 0;
        r.finalScore = repeatScore * 0.5 + r.finalScore * 0.5;
        r.components['repeatScore'] = repeatScore;
      }

      // Re-sort after override
      ranked.sort((a, b) => b.finalScore - a.finalScore);

      const finalResults = this.postProcessor.process(ranked, limit);

      return {
        products: finalResults,
        metadata: {
          confidence,
          reason: RecommendationReason.PREVIOUS_ORDERS,
          source: RecommendationSource.ONLINE,
          fallbackUsed: false,
          retrievedCandidates: candidates.length,
          returnedProducts: finalResults.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error in RepeatPurchaseStrategy: ${error.message}`,
        error.stack,
      );
      return emptyResult;
    }
  }
}

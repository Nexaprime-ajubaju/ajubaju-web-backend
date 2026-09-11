import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { HomepageRecommendationService } from './homepage-recommendation.service';
import {
  RecommendationFactory,
  RECOMMENDATION_STRATEGIES,
} from './recommendation.factory';
import { MerchantRepository } from './repositories/merchant.repository';
import { NearbyScorer } from './scorers/nearby.scorer';
import { NearbyStrategy } from './strategies/nearby.strategy';
import { HomepageConfigModule } from '../homepage-config/homepage-config.module';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import {
  OfferPromotion,
  OfferPromotionSchema,
} from '../offers/schemas/offer-promotion.schema';
import { AnalyticsModule } from '../analytics/analytics.module';
import { InterestStrategy } from './strategies/interest.strategy';
import { ContinueShoppingStrategy } from './strategies/continue-shopping.strategy';
import { NewArrivalsStrategy } from './strategies/new-arrivals.strategy';
import { FlashDealsStrategy } from './strategies/flash-deals.strategy';
import { BestSellingStrategy } from './strategies/best-selling.strategy';
import { SeasonalStrategy } from './strategies/seasonal.strategy';
import { SponsoredStrategy } from './strategies/sponsored.strategy';
import { SeasonResolverService } from './strategies/season-resolver.service';
import { RepeatPurchaseStrategy } from './strategies/repeat-purchase.strategy';
import { CollaborativeStrategy } from './strategies/collaborative.strategy';
import { TrendingStrategy } from './strategies/trending.strategy';
import { FrequentlyBoughtTogetherStrategy } from './strategies/frequently-bought-together.strategy';
import { SimilarProductsStrategy } from './strategies/similar-products.strategy';
import { RecentlyViewedStrategy } from './strategies/recently-viewed.strategy';
import { RankingService } from './ranking/ranking.service';
import { PostProcessorService } from './ranking/post-processor.service';
import { FeatureStoreModule } from '../feature-store/feature-store.module';
import { CandidateRetrieverService } from './retrievers/candidate-retriever.service';
import { AffinityComponent } from './ranking/components/affinity.component';
import { DistanceComponent } from './ranking/components/distance.component';
import { PopularityComponent } from './ranking/components/popularity.component';
import { FreshnessComponent } from './ranking/components/freshness.component';
import { CtrComponent } from './ranking/components/ctr.component';
import { ConversionComponent } from './ranking/components/conversion.component';
import { MerchantQualityComponent } from './ranking/components/merchant-quality.component';
import { InventoryComponent } from './ranking/components/inventory.component';
import { PriceValueComponent } from './ranking/components/price-value.component';
import { RankingComponentRegistry } from './ranking/ranking-component.registry';
import { ActiveStatusPolicy } from './ranking/policies/active-status.policy';
import { ProgressiveDiversityPolicy } from './ranking/policies/progressive-diversity.policy';
import { OfflineIntelligenceModule } from './offline-intelligence/offline-intelligence.module';
import { RankingConfigService } from './ranking/ranking-config.service';
import { RecommendationDebugController } from './controllers/recommendation-debug.controller';
import { ExperimentationModule } from './experimentation/experimentation.module';

@Module({
  imports: [
    HomepageConfigModule,
    AnalyticsModule,
    FeatureStoreModule,
    OfflineIntelligenceModule,
    ExperimentationModule,
    MongooseModule.forFeature([
      { name: Merchant.name, schema: MerchantSchema },
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
    ]),
  ],
  controllers: [RecommendationController, RecommendationDebugController],
  providers: [
    RecommendationService,
    HomepageRecommendationService,
    MerchantRepository,
    CandidateRetrieverService,
    RankingComponentRegistry,
    AffinityComponent,
    DistanceComponent,
    PopularityComponent,
    FreshnessComponent,
    CtrComponent,
    ConversionComponent,
    MerchantQualityComponent,
    InventoryComponent,
    PriceValueComponent,
    ActiveStatusPolicy,
    ProgressiveDiversityPolicy,
    RankingConfigService,
    RankingService,
    PostProcessorService,
    NearbyScorer,
    NearbyStrategy,
    InterestStrategy,
    ContinueShoppingStrategy,
    NewArrivalsStrategy,
    FlashDealsStrategy,
    BestSellingStrategy,
    SeasonalStrategy,
    SponsoredStrategy,
    RepeatPurchaseStrategy,
    CollaborativeStrategy,
    TrendingStrategy,
    FrequentlyBoughtTogetherStrategy,
    SimilarProductsStrategy,
    RecentlyViewedStrategy,
    SeasonResolverService,
    {
      provide: RECOMMENDATION_STRATEGIES,
      useFactory: (
        nearbyStrategy: NearbyStrategy,
        interestStrategy: InterestStrategy,
        continueShoppingStrategy: ContinueShoppingStrategy,
        newArrivalsStrategy: NewArrivalsStrategy,
        flashDealsStrategy: FlashDealsStrategy,
        bestSellingStrategy: BestSellingStrategy,
        seasonalStrategy: SeasonalStrategy,
        sponsoredStrategy: SponsoredStrategy,
        repeatPurchaseStrategy: RepeatPurchaseStrategy,
        collaborativeStrategy: CollaborativeStrategy,
        trendingStrategy: TrendingStrategy,
        frequentlyBoughtTogetherStrategy: FrequentlyBoughtTogetherStrategy,
        similarProductsStrategy: SimilarProductsStrategy,
        recentlyViewedStrategy: RecentlyViewedStrategy,
      ) => {
        return [
          nearbyStrategy,
          interestStrategy,
          continueShoppingStrategy,
          newArrivalsStrategy,
          flashDealsStrategy,
          bestSellingStrategy,
          seasonalStrategy,
          sponsoredStrategy,
          repeatPurchaseStrategy,
          collaborativeStrategy,
          trendingStrategy,
          frequentlyBoughtTogetherStrategy,
          similarProductsStrategy,
          recentlyViewedStrategy,
        ];
      },
      inject: [
        NearbyStrategy,
        InterestStrategy,
        ContinueShoppingStrategy,
        NewArrivalsStrategy,
        FlashDealsStrategy,
        BestSellingStrategy,
        SeasonalStrategy,
        SponsoredStrategy,
        RepeatPurchaseStrategy,
        CollaborativeStrategy,
        TrendingStrategy,
        FrequentlyBoughtTogetherStrategy,
        SimilarProductsStrategy,
        RecentlyViewedStrategy,
      ],
    },
    {
      provide: RecommendationFactory,
      useFactory: (strategies: any[]) => new RecommendationFactory(strategies),
      inject: [RECOMMENDATION_STRATEGIES],
    },
  ],
  exports: [
    RecommendationService,
    HomepageRecommendationService,
    RankingService,
    PostProcessorService,
    CandidateRetrieverService,
    RankingConfigService,
  ],
})
export class RecommendationEngineModule {}

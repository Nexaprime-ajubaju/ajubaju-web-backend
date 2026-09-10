import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { KafkaModule } from '../kafka/kafka.module';
import { ModerationModule } from '../moderation/moderation.module';
import { SecurityModule } from '../security/security.module';
import { RegionsModule } from '../regions/regions.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { BannerPromotion, BannerPromotionSchema } from './schemas/banner-promotion.schema';
import { BannerQueue, BannerQueueSchema } from './schemas/banner-queue.schema';
import { BannerSchedulerState, BannerSchedulerStateSchema } from './schemas/banner-scheduler-state.schema';
import { BannerImpression, BannerImpressionSchema } from './schemas/banner-impression.schema';
import { BannerClick, BannerClickSchema } from './schemas/banner-click.schema';
import { BannerAnalyticsSummary, BannerAnalyticsSummarySchema } from './schemas/banner-analytics-summary.schema';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

import { BannerEligibilityService } from './services/banner-eligibility.service';
import { BannerQueueService } from './services/banner-queue.service';
import { BannerCacheService } from './services/banner-cache.service';
import { BannerRotationPolicyService } from './services/banner-rotation-policy.service';
import { BannerRotationSchedulerService } from './services/banner-rotation-scheduler.service';
import { BannerServingService } from './services/banner-serving.service';
import { BannerTrackingService } from './services/banner-tracking.service';
import { BannerAnalyticsService } from './services/banner-analytics.service';
import { BannerAdminService } from './services/banner-admin.service';
import { BannerPricingService } from './services/banner-pricing.service';
import { TransactionModule } from '../common/services/transaction.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: BannerPromotion.name, schema: BannerPromotionSchema },
      { name: BannerQueue.name, schema: BannerQueueSchema },
      { name: BannerSchedulerState.name, schema: BannerSchedulerStateSchema },
      { name: BannerImpression.name, schema: BannerImpressionSchema },
      { name: BannerClick.name, schema: BannerClickSchema },
      { name: BannerAnalyticsSummary.name, schema: BannerAnalyticsSummarySchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    forwardRef(() => KafkaModule),
    TransactionModule,
    ModerationModule,
    SecurityModule,
    SubscriptionsModule,
    WalletsModule,
    ReferralsModule,
    forwardRef(() => RegionsModule),
  ],
  controllers: [BannersController],
  providers: [
    BannersService,
    BannerEligibilityService,
    BannerQueueService,
    BannerCacheService,
    BannerRotationPolicyService,
    BannerRotationSchedulerService,
    BannerServingService,
    BannerTrackingService,
    BannerAnalyticsService,
    BannerAdminService,
    BannerPricingService,
  ],
  exports: [
    BannersService,
    BannerEligibilityService,
    BannerQueueService,
    BannerCacheService,
    BannerRotationPolicyService,
    BannerRotationSchedulerService,
    BannerServingService,
    BannerTrackingService,
    BannerAnalyticsService,
    BannerAdminService,
    BannerPricingService,
  ],
})
export class BannersModule {}

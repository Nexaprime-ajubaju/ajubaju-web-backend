import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsKafkaController } from './analytics.kafka.controller';
import { Ad, AdSchema } from '../ads/schemas/category-schemas/ad.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { KafkaModule } from '../kafka/kafka.module';

import { RecommendationAnalyticsController } from './recommendation-analytics.controller';
import { RecommendationAnalyticsService } from './recommendation-analytics.service';
import {
  RecommendationEvent,
  RecommendationEventSchema,
} from './schemas/recommendation-event.schema';
import {
  RecommendationLog,
  RecommendationLogSchema,
} from './schemas/recommendation-log.schema';
import {
  RecommendationMetric,
  RecommendationMetricSchema,
} from './schemas/recommendation-metric.schema';
import { RecommendationMetricsService } from './recommendation-metrics.service';
import { RecommendationHealthService } from './recommendation-health.service';
import { AdminRecommendationAnalyticsController } from './admin-recommendation-analytics.controller';
import { InterestBuilderService } from './interest-builder.service';
import {
  UserInterestProfile,
  UserInterestProfileSchema,
} from './schemas/user-interest-profile.schema';
import { ProfileBlenderService } from './profile-blender.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ad.name, schema: AdSchema },
      { name: User.name, schema: UserSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: RecommendationEvent.name, schema: RecommendationEventSchema },
      { name: RecommendationLog.name, schema: RecommendationLogSchema },
      { name: RecommendationMetric.name, schema: RecommendationMetricSchema },
      { name: UserInterestProfile.name, schema: UserInterestProfileSchema },
    ]),
    KafkaModule,
  ],
  controllers: [
    AnalyticsController,
    AnalyticsKafkaController,
    RecommendationAnalyticsController,
    AdminRecommendationAnalyticsController,
  ],
  providers: [
    AnalyticsService,
    RecommendationAnalyticsService,
    RecommendationMetricsService,
    RecommendationHealthService,
    InterestBuilderService,
    ProfileBlenderService,
  ],
  exports: [
    AnalyticsService,
    RecommendationAnalyticsService,
    InterestBuilderService,
    ProfileBlenderService,
  ],
})
export class AnalyticsModule {}

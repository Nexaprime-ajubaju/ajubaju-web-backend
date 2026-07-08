import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProductFeature,
  ProductFeatureSchema,
} from './product/product-feature.schema';
import { ProductFeatureService } from './product/product-feature.service';
import { FeatureSchedulerService } from './scheduler/feature-scheduler.service';
import { Ad, AdSchema } from '../ads/schemas/category-schemas/ad.schema';
import {
  RecommendationEvent,
  RecommendationEventSchema,
} from '../analytics/schemas/recommendation-event.schema';
import { TransactionModule } from '../common/services/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductFeature.name, schema: ProductFeatureSchema },
      { name: Ad.name, schema: AdSchema },
      { name: RecommendationEvent.name, schema: RecommendationEventSchema },
    ]),
    TransactionModule,
  ],
  providers: [ProductFeatureService, FeatureSchedulerService],
  exports: [ProductFeatureService],
})
export class FeatureStoreModule {}

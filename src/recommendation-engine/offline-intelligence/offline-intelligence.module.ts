import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrendingProduct, TrendingProductSchema } from './schemas/trending-product.schema';
import { ProductRelationship, ProductRelationshipSchema } from './schemas/product-relationship.schema';
import { RecommendationEvent, RecommendationEventSchema } from '../../analytics/schemas/recommendation-event.schema';
import { Ad, AdSchema } from '../../ads/schemas/category-schemas/ad.schema';
import { TrendingJob } from './trending.job';
import { FbtJob } from './fbt.job';
import { SimilarProductsJob } from './similar-products.job';
import { SimilarProduct, SimilarProductSchema } from './schemas/similar-product.schema';
import { SimilarCustomersJob } from './similar-customers.job';
import { SimilarCustomer, SimilarCustomerSchema } from './schemas/similar-customer.schema';
import { OfflineJobSchedulerService } from './offline-job-scheduler.service';
import { BestSellersJob } from './best-sellers.job';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrendingProduct.name, schema: TrendingProductSchema },
      { name: ProductRelationship.name, schema: ProductRelationshipSchema },
      { name: SimilarProduct.name, schema: SimilarProductSchema },
      { name: SimilarCustomer.name, schema: SimilarCustomerSchema },
      { name: RecommendationEvent.name, schema: RecommendationEventSchema },
      { name: Ad.name, schema: AdSchema },
    ]),
  ],
  providers: [TrendingJob, FbtJob, SimilarProductsJob, SimilarCustomersJob, BestSellersJob, OfflineJobSchedulerService],
  exports: [MongooseModule],
})
export class OfflineIntelligenceModule {}

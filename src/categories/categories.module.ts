import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { Category, CategorySchema } from './schemas/category.schema';
import { Ad, AdSchema } from '../ads/schemas/category-schemas/ad.schema';
import {
  OfferPromotion,
  OfferPromotionSchema,
} from '../offers/schemas/offer-promotion.schema';

import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
    ]),
    MongooseModule.forFeature([{ name: Ad.name, schema: AdSchema }]),
    MongooseModule.forFeature([
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
    ]),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}

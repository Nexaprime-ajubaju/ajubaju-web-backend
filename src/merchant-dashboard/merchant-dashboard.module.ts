import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Ad, AdSchema } from '../ads/schemas/category-schemas/ad.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  MerchantProduct,
  MerchantProductSchema,
} from '../merchant-products/schemas/merchant-product.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Voucher, VoucherSchema } from '../vouchers/schemas/voucher.schema';
import {
  MerchantDailyView,
  MerchantDailyViewSchema,
} from '../merchants/schemas/merchant-daily-view.schema';
import {
  OfferLikeHistory,
  OfferLikeHistorySchema,
} from '../offers/schemas/offer-like-history.schema';
import { Follow, FollowSchema } from '../users/schemas/follow.schema';
import {
  OfferPromotion,
  OfferPromotionSchema,
} from '../offers/schemas/offer-promotion.schema';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { MerchantDashboardKafkaController } from './merchant-dashboard.kafka.controller';
import { MerchantDashboardService } from './merchant-dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ad.name, schema: AdSchema },
      { name: Order.name, schema: OrderSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
      { name: Voucher.name, schema: VoucherSchema },
      { name: MerchantDailyView.name, schema: MerchantDailyViewSchema },
      { name: OfferLikeHistory.name, schema: OfferLikeHistorySchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
    ]),
    SubscriptionsModule,
  ],
  controllers: [MerchantDashboardController, MerchantDashboardKafkaController],
  providers: [MerchantDashboardService],
})
export class MerchantDashboardModule {}

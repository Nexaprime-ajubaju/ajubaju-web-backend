import { Module } from '@nestjs/common';
import { MerchantPlanModule } from '../merchant-plan/merchant-plan.module';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Ad, AdSchema } from '../ads/schemas/category-schemas/ad.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Voucher, VoucherSchema } from '../vouchers/schemas/voucher.schema';
import { OfferLikeHistory, OfferLikeHistorySchema } from '../offers/schemas/offer-like-history.schema';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { MerchantDashboardKafkaController } from './merchant-dashboard.kafka.controller';
import { MerchantDashboardService } from './merchant-dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ad.name, schema: AdSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
      { name: Voucher.name, schema: VoucherSchema },
      { name: OfferLikeHistory.name, schema: OfferLikeHistorySchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    MerchantPlanModule,
  ],
  controllers: [MerchantDashboardController, MerchantDashboardKafkaController],
  providers: [MerchantDashboardService],
})
export class MerchantDashboardModule {}

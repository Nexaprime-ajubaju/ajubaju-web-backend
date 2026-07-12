import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { Follow, FollowSchema } from '../users/schemas/follow.schema';
import { Notification, NotificationSchema } from '../users/schemas/notification.schema';
import { MerchantProduct, MerchantProductSchema } from '../merchant-products/schemas/merchant-product.schema';
import { OfferPromotion, OfferPromotionSchema } from './schemas/offer-promotion.schema';
import { OfferLikeHistory, OfferLikeHistorySchema } from './schemas/offer-like-history.schema';
import { Voucher, VoucherSchema } from '../vouchers/schemas/voucher.schema';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { BannersModule } from '../banners/banners.module';
import { RedisModule } from '../common/services/redis.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: OfferLikeHistory.name, schema: OfferLikeHistorySchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
      { name: Voucher.name, schema: VoucherSchema },
    ]),
    forwardRef(() => KafkaModule),
    BannersModule,
    RedisModule, // Offers cache
    ModerationModule,
  ],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import {
  MerchantProduct,
  MerchantProductSchema,
} from '../merchant-products/schemas/merchant-product.schema';
import {
  OfferPromotion,
  OfferPromotionSchema,
} from '../offers/schemas/offer-promotion.schema';
import {
  SearchHistory,
  SearchHistorySchema,
} from './schemas/search-history.schema';
import {
  SearchDemandKeyword,
  SearchDemandKeywordSchema,
} from './schemas/search-demand-keyword.schema';
import {
  ItemDemandRequest,
  ItemDemandRequestSchema,
} from './schemas/item-demand-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Notification,
  NotificationSchema,
} from '../users/schemas/notification.schema';
import { RedisModule } from '../common/services/redis.module';
import { EmailModule } from '../common/services/email.service';

@Module({
  imports: [
    RedisModule,
    EmailModule,
    MongooseModule.forFeature([
      { name: Merchant.name, schema: MerchantSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: SearchHistory.name, schema: SearchHistorySchema },
      { name: SearchDemandKeyword.name, schema: SearchDemandKeywordSchema },
      { name: ItemDemandRequest.name, schema: ItemDemandRequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

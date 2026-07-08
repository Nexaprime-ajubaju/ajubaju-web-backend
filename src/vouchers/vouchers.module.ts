import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { Voucher, VoucherSchema } from './schemas/voucher.schema';
import {
  BannerPromotion,
  BannerPromotionSchema,
} from '../banners/schemas/banner-promotion.schema';
import {
  OfferPromotion,
  OfferPromotionSchema,
} from '../offers/schemas/offer-promotion.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import {
  MerchantProduct,
  MerchantProductSchema,
} from '../merchant-products/schemas/merchant-product.schema';
import { KafkaModule } from '../kafka/kafka.module';
import { VouchersKafkaController } from './vouchers.kafka.controller';
import { OrdersModule } from '../orders/orders.module';
import { TransactionModule } from '../common/services/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Voucher.name, schema: VoucherSchema },
      { name: BannerPromotion.name, schema: BannerPromotionSchema },
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
    ]),
    forwardRef(() => KafkaModule),
    OrdersModule,
    TransactionModule,
  ],
  controllers: [VouchersController, VouchersKafkaController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}

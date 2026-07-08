import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import {
  BannerPromotion,
  BannerPromotionSchema,
} from './schemas/banner-promotion.schema';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { TransactionModule } from '../common/services/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BannerPromotion.name, schema: BannerPromotionSchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    forwardRef(() => KafkaModule),
    TransactionModule,
  ],
  controllers: [BannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}

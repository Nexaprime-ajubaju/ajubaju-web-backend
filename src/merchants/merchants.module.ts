import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PublicMerchantsController } from './public-merchants.controller';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { MerchantDailyView, MerchantDailyViewSchema } from './schemas/merchant-daily-view.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { OTP, OTPSchema } from '../users/schemas/otp.schema';
import { DeletedAccount, DeletedAccountSchema } from '../users/schemas/deleted-account.schema';

import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Merchant.name, schema: MerchantSchema },
      { name: User.name, schema: UserSchema },
      { name: OTP.name, schema: OTPSchema },
      { name: MerchantDailyView.name, schema: MerchantDailyViewSchema },
      { name: DeletedAccount.name, schema: DeletedAccountSchema },
    ]),
    RedisModule,
  ],
  controllers: [MerchantsController, PublicMerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

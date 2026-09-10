import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Referral, ReferralSchema } from './schemas/referral.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';

import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../subscriptions/schemas/subscription-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Referral.name, schema: ReferralSchema },
      { name: User.name, schema: UserSchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema }
    ]),
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService, MongooseModule],
})
export class ReferralsModule {}

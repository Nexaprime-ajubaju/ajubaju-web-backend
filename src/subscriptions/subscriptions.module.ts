import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionPlan, SubscriptionPlanSchema } from './schemas/subscription-plan.schema';
import { MerchantSubscriptionHistory, MerchantSubscriptionHistorySchema } from './schemas/merchant-subscription-history.schema';
import { MerchantBannerCredits, MerchantBannerCreditsSchema } from './schemas/merchant-banner-credits.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionSeed } from './subscription.seed';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: MerchantSubscriptionHistory.name, schema: MerchantSubscriptionHistorySchema },
      { name: MerchantBannerCredits.name, schema: MerchantBannerCreditsSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
  ],
  providers: [SubscriptionsService, SubscriptionSeed],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

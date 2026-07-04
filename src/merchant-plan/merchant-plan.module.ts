import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MerchantPlanService } from './merchant-plan.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { OfferPromotion, OfferPromotionSchema } from '../offers/schemas/offer-promotion.schema';
import { MerchantProduct, MerchantProductSchema } from '../merchant-products/schemas/merchant-product.schema';

@Module({
  imports: [
    SystemSettingsModule,
    MongooseModule.forFeature([
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
    ]),
  ],
  providers: [MerchantPlanService],
  exports: [MerchantPlanService]
})
export class MerchantPlanModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { MerchantProduct, MerchantProductSchema } from '../merchant-products/schemas/merchant-product.schema';
import { OfferPromotion, OfferPromotionSchema } from '../offers/schemas/offer-promotion.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Merchant.name, schema: MerchantSchema },
      { name: MerchantProduct.name, schema: MerchantProductSchema },
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';
import {
  MerchantProduct,
  MerchantProductSchema,
} from './schemas/merchant-product.schema';
import { MerchantProductsController } from './merchant-products.controller';
import { MerchantProductsService } from './merchant-products.service';

import { MerchantPlanModule } from '../merchant-plan/merchant-plan.module';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MerchantProduct.name, schema: MerchantProductSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    KafkaModule,
    RedisModule, // Cache merchant product listings, inventory
    MerchantPlanModule,
  ],
  controllers: [MerchantProductsController],
  providers: [MerchantProductsService],
  exports: [MerchantProductsService],
})
export class MerchantProductsModule {}

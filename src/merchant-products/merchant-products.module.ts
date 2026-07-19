import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';
import { ModerationModule } from '../moderation/moderation.module';
import { SecurityModule } from '../security/security.module';
import {
  MerchantProduct,
  MerchantProductSchema,
} from './schemas/merchant-product.schema';
import { MerchantProductsController } from './merchant-products.controller';
import { MerchantProductsService } from './merchant-products.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { TransactionModule } from '../common/services/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MerchantProduct.name, schema: MerchantProductSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    TransactionModule,
    KafkaModule,
    RedisModule, // Cache merchant product listings, inventory
    SubscriptionsModule,
    ModerationModule,
    SecurityModule,
  ],
  controllers: [MerchantProductsController],
  providers: [MerchantProductsService],
  exports: [MerchantProductsService],
})
export class MerchantProductsModule {}

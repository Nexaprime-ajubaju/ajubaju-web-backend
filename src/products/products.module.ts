import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';

import { MerchantPlanModule } from '../merchant-plan/merchant-plan.module';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Merchant.name, schema: MerchantSchema }
    ]),
    KafkaModule, // Inventory updates, product events
    RedisModule, // Cache product listings, inventory, search results
    MerchantPlanModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}

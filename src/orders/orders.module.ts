import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Notification,
  NotificationSchema,
} from '../users/schemas/notification.schema';
import { OrdersKafkaController } from './orders.kafka.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';

import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { MerchantPlanModule } from '../merchant-plan/merchant-plan.module';
import { TransactionModule } from '../common/services/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
    KafkaModule, // Order placement, status updates, fulfillment events
    RedisModule, // Cache order history, status lookups
    MerchantPlanModule,
    TransactionModule,
  ],
  controllers: [OrdersController, OrdersKafkaController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

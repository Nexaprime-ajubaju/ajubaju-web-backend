import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, KafkaContext, MessagePattern, Payload } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';
import { OrderStatus } from './schemas/order.schema';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersKafkaController {
  private readonly logger = new Logger(OrdersKafkaController.name);

  constructor(
    private readonly ordersService: OrdersService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private getValue(message: any) {
    return message?.value ?? message ?? {};
  }

  private getCorrelationId(message: any): string {
    return message?.headers?.correlationId || 'unknown';
  }

  private success(data: any, correlationId: string) {
    return {
      success: true,
      data,
      correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  private failure(error: any, correlationId: string) {
    return {
      success: false,
      error: {
        message: error?.message || 'Internal error',
        code: error?.code || 'INTERNAL_ERROR',
      },
      correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  @MessagePattern(KAFKA_TOPICS.ORDER_GET_MERCHANT)
  async handleGetMerchantOrders(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.ordersService.getMerchantOrders(
        value.merchantId,
        Number(value.page || 1),
        Number(value.limit || 20),
        value.status,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed ORDER_GET_MERCHANT: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.ORDER_GET_STATS)
  async handleGetMerchantStats(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.ordersService.getMerchantOrderStats(value.merchantId);
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed ORDER_GET_STATS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.ORDER_UPDATE_STATUS)
  async handleUpdateOrderStatus(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.ordersService.updateOrderStatus(
        value.merchantId,
        value.orderId,
        value.status as OrderStatus,
      );

      if (this.kafkaService && result?.success) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.ORDER_STATUS_UPDATED,
          {
            orderId: result?.data?._id,
            status: result?.data?.status,
            merchantId: value.merchantId,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed ORDER_UPDATE_STATUS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

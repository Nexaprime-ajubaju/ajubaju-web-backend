import { Controller, Logger, Optional } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';
import { MerchantDashboardService } from './merchant-dashboard.service';

@Controller()
export class MerchantDashboardKafkaController {
  private readonly logger = new Logger(MerchantDashboardKafkaController.name);

  constructor(
    private readonly merchantDashboardService: MerchantDashboardService,
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

  @MessagePattern(KAFKA_TOPICS.MERCHANT_DASHBOARD_SUMMARY)
  async handleSummary(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.merchantDashboardService.getSummary(
        value.merchantId,
      );

      if (this.kafkaService && result?.success) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.MERCHANT_DASHBOARD_SUMMARY_GENERATED,
          {
            merchantId: value.merchantId,
            generatedAt: new Date().toISOString(),
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed MERCHANT_DASHBOARD_SUMMARY: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

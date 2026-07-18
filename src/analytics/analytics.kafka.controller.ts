import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { AnalyticsService } from './analytics.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';

@Controller()
export class AnalyticsKafkaController {
  private readonly logger = new Logger(AnalyticsKafkaController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

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

  @MessagePattern(KAFKA_TOPICS.ANALYTICS_DEVICE_BREAKDOWN)
  async handleDeviceBreakdown(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const correlationId = this.getCorrelationId(message);
    try {
      return this.success(
        await this.analyticsService.getDeviceBreakdown(),
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed ANALYTICS_DEVICE_BREAKDOWN: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.ANALYTICS_TOP_REGIONS)
  async handleTopRegions(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const correlationId = this.getCorrelationId(message);
    try {
      return this.success(
        await this.analyticsService.getTopRegions(),
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed ANALYTICS_TOP_REGIONS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.ANALYTICS_TOP_PAGES)
  async handleTopPages(@Payload() message: any, @Ctx() context: KafkaContext) {
    const correlationId = this.getCorrelationId(message);
    try {
      return this.success(
        await this.analyticsService.getTopPages(),
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed ANALYTICS_TOP_PAGES: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.ANALYTICS_EVENTS)
  async handleEvents(@Payload() message: any, @Ctx() context: KafkaContext) {
    const correlationId = this.getCorrelationId(message);
    try {
      return this.success(
        await this.analyticsService.getEvents(),
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed ANALYTICS_EVENTS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.ANALYTICS_RECENT_ACTIVITY)
  async handleRecentActivity(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const correlationId = this.getCorrelationId(message);
    try {
      return this.success(
        await this.analyticsService.getRecentActivity(),
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed ANALYTICS_RECENT_ACTIVITY: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

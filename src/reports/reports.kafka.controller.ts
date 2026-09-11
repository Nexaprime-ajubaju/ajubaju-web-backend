import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { ReportsGateway } from './reports.gateway';

@Controller()
export class ReportsKafkaController {
  private readonly logger = new Logger(ReportsKafkaController.name);

  constructor(private readonly reportsGateway: ReportsGateway) {}

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

  @MessagePattern(KAFKA_TOPICS.AD_REPORT_SUBMITTED)
  handleReportSubmitted(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      this.reportsGateway.broadcastNewReport(value);
      return this.success({ broadcasted: true }, correlationId);
    } catch (error) {
      this.logger.error(
        `Failed AD_REPORT_SUBMITTED handling: ${error.message}`,
      );
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.REPORTS_STATUS)
  handleStatus(@Payload() message: any, @Ctx() context: KafkaContext) {
    const correlationId = this.getCorrelationId(message);

    try {
      return this.success(
        this.reportsGateway.getGatewayStatus(),
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed REPORTS_STATUS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

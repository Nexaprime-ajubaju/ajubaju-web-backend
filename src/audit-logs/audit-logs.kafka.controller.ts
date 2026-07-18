import { Controller, Logger, Optional, Inject } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { AuditLogsService } from './audit-logs.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';

@Controller()
export class AuditLogsKafkaController {
  private readonly logger = new Logger(AuditLogsKafkaController.name);

  constructor(
    private readonly auditLogsService: AuditLogsService,
    @Optional()
    @Inject(KafkaService)
    private readonly kafkaService?: KafkaService,
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

  @MessagePattern(KAFKA_TOPICS.AUDIT_LOG_CREATE)
  async handleCreateLog(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const log = await this.auditLogsService.log(value);

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.AUDIT_LOG_CREATED,
          {
            logId: (log as any)?._id?.toString?.() || null,
            action: value?.action,
            targetId: value?.targetId,
            targetType: value?.targetType,
          },
          correlationId,
        );
      }

      return this.success(log, correlationId);
    } catch (error) {
      this.logger.error(`Failed AUDIT_LOG_CREATE: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.AUDIT_LOG_LIST)
  async handleListLogs(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const page = Number(value.page) || 1;
      const limit = Number(value.limit) || 50;
      const result = await this.auditLogsService.getAllLogs(page, limit);
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed AUDIT_LOG_LIST: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

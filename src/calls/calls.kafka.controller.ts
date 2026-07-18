import { Controller, Logger, Optional } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { CallsService } from './calls.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';

@Controller()
export class CallsKafkaController {
  private readonly logger = new Logger(CallsKafkaController.name);

  constructor(
    private readonly callsService: CallsService,
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

  @MessagePattern(KAFKA_TOPICS.CALL_GET_HISTORY)
  async handleGetHistory(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.callsService.listCallsForUser(
        value.userId,
        value.query || {},
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CALL_GET_HISTORY: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CALL_GET_BY_ID)
  async handleGetById(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.callsService.ensureParticipant(
        value.callId,
        value.userId,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CALL_GET_BY_ID: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CALL_CREATE_INVITE)
  async handleCreateInvite(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.callsService.createCallInvite(
        value.callerId,
        value.conversationId,
        value.calleeId,
        value.type,
      );

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CALL_INVITED,
          {
            callerId: value.callerId,
            calleeId: value.calleeId,
            callId: result?.call?.callId || null,
            conversationId: value.conversationId,
            busy: !!result?.busy,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CALL_CREATE_INVITE: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CALL_ACCEPT)
  async handleAccept(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.callsService.acceptCall(
        value.callId,
        value.userId,
      );

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CALL_ACCEPTED,
          {
            callId: result.callId,
            by: value.userId,
            answeredAt: result.answeredAt,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CALL_ACCEPT: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CALL_REJECT)
  async handleReject(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.callsService.rejectCall(
        value.callId,
        value.userId,
      );

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CALL_REJECTED,
          {
            callId: result.callId,
            by: value.userId,
            reason: result.endReason,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CALL_REJECT: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CALL_END)
  async handleEnd(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.callsService.endCall(
        value.callId,
        value.userId,
        value.reason || 'hangup',
      );

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CALL_ENDED,
          {
            callId: result.callId,
            by: value.userId,
            endedAt: result.endedAt,
            durationSec: result.durationSec,
            reason: result.endReason,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CALL_END: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

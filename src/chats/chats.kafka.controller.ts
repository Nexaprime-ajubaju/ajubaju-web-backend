import { Controller, Logger, Optional } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { ChatsService } from './chats.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';

@Controller()
export class ChatsKafkaController {
  private readonly logger = new Logger(ChatsKafkaController.name);

  constructor(
    private readonly chatsService: ChatsService,
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

  @MessagePattern(KAFKA_TOPICS.CHAT_START_CONVERSATION)
  async handleStartConversation(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const userId = value.currentUserId || value.userId;
      const dto = value.dto || value;
      const result = await this.chatsService.startConversation(userId, dto);

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CHAT_CONVERSATION_STARTED,
          {
            conversationId: result?.id,
            adId: result?.adId,
            userId,
            participants: result?.participants || [],
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CHAT_START_CONVERSATION: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CHAT_LIST_CONVERSATIONS)
  async handleListConversations(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const userId = value.userId;
      const result = await this.chatsService.listConversations(userId);
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CHAT_LIST_CONVERSATIONS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CHAT_LIST_MESSAGES)
  async handleListMessages(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const userId = value.userId;
      const conversationId = value.conversationId;
      const query = value.query || {};
      const result = await this.chatsService.listMessages(
        userId,
        conversationId,
        query,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CHAT_LIST_MESSAGES: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CHAT_SEND_MESSAGE)
  async handleSendMessage(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const userId = value.userId;
      const conversationId = value.conversationId;
      const dto = value.dto || value;
      const result = await this.chatsService.sendMessage(
        userId,
        conversationId,
        dto,
      );

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CHAT_MESSAGE_SENT,
          {
            conversationId: result?.conversationId,
            messageId: result?.id,
            senderId: result?.senderId,
            adId: result?.adId,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed CHAT_SEND_MESSAGE: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.CHAT_DELETE_CONVERSATION)
  async handleDeleteConversation(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const userId = value.userId;
      const conversationId = value.conversationId;
      await this.chatsService.deleteConversation(userId, conversationId);

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.CHAT_CONVERSATION_DELETED,
          { userId, conversationId },
          correlationId,
        );
      }

      return this.success(
        { message: 'Conversation deleted successfully' },
        correlationId,
      );
    } catch (error) {
      this.logger.error(`Failed CHAT_DELETE_CONVERSATION: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

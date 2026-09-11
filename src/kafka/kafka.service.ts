import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafkaClient: ClientKafka | null = null;

  constructor(private configService: ConfigService) {
    this.initializeKafkaClient();
  }

  // ==================== INITIALIZATION WITH RAILWAY SUPPORT ====================
  private initializeKafkaClient() {
    const kafkaConfig = this.configService.get('config.kafka');

    // Check if Kafka is enabled
    if (!kafkaConfig?.enabled) {
      this.logger.log('Kafka is disabled via ENABLE_KAFKA=false');
      this.kafkaClient = null;
      return;
    }

    // Validate brokers
    if (!kafkaConfig.brokers || kafkaConfig.brokers.length === 0) {
      this.logger.error('Kafka is enabled but no brokers configured');
      this.kafkaClient = null;
      return;
    }

    const options: any = {
      client: {
        clientId: kafkaConfig.clientId,
        brokers: kafkaConfig.brokers,
        retry: {
          initialRetryTime: 300,
          retries: 8,
          maxRetryTime: 30000,
        },
        connectionTimeout: 5000, // Add connection timeout
        authenticationTimeout: 5000,
      },
      consumer: {
        groupId: kafkaConfig.groupId,
        allowAutoTopicCreation: true,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
      },
      producer: {
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      },
    };

    // 🔴 IMPORTANT: Add SASL authentication for Railway
    if (kafkaConfig.sasl?.username && kafkaConfig.sasl?.password) {
      this.logger.log('Configuring SASL authentication for Railway Kafka');
      options.client.sasl = {
        mechanism: kafkaConfig.sasl.mechanism || 'plain',
        username: kafkaConfig.sasl.username,
        password: kafkaConfig.sasl.password,
      };
      options.client.ssl = false; // Railway uses plaintext internally
    } else {
      this.logger.warn(
        'No SASL credentials provided for Kafka - connection may fail',
      );
    }

    this.logger.log(
      `Kafka client initialized with brokers: ${kafkaConfig.brokers.join(', ')}`,
    );
    this.kafkaClient = new ClientKafka(options);
  }

  // ==================== LIFECYCLE HOOKS ====================

  async onModuleInit() {
    // Skip if Kafka is disabled or client not initialized
    if (!this.kafkaClient) {
      this.logger.log('Kafka client not initialized, skipping connection');
      return;
    }

    try {
      // Subscribe to response topics
      const topics = [
        KAFKA_TOPICS.AD_CREATE,
        KAFKA_TOPICS.AD_UPDATE,
        KAFKA_TOPICS.AD_DELETE,
        KAFKA_TOPICS.AD_GET,
        KAFKA_TOPICS.AD_GET_BY_CATEGORY,
        KAFKA_TOPICS.AD_GET_BY_USER,
        KAFKA_TOPICS.AD_SEARCH,
        KAFKA_TOPICS.AD_GET_NEARBY,
        KAFKA_TOPICS.CHAT_START_CONVERSATION,
        KAFKA_TOPICS.CHAT_LIST_CONVERSATIONS,
        KAFKA_TOPICS.CHAT_LIST_MESSAGES,
        KAFKA_TOPICS.CHAT_SEND_MESSAGE,
        KAFKA_TOPICS.CHAT_DELETE_CONVERSATION,
        KAFKA_TOPICS.CALL_GET_HISTORY,
        KAFKA_TOPICS.CALL_GET_BY_ID,
        KAFKA_TOPICS.CALL_CREATE_INVITE,
        KAFKA_TOPICS.CALL_ACCEPT,
        KAFKA_TOPICS.CALL_REJECT,
        KAFKA_TOPICS.CALL_END,
        KAFKA_TOPICS.ANALYTICS_DEVICE_BREAKDOWN,
        KAFKA_TOPICS.ANALYTICS_TOP_REGIONS,
        KAFKA_TOPICS.ANALYTICS_TOP_PAGES,
        KAFKA_TOPICS.ANALYTICS_EVENTS,
        KAFKA_TOPICS.ANALYTICS_RECENT_ACTIVITY,
        KAFKA_TOPICS.AUDIT_LOG_CREATE,
        KAFKA_TOPICS.AUDIT_LOG_LIST,
        KAFKA_TOPICS.REPORTS_STATUS,
      ];

      topics.forEach((topic) => {
        this.kafkaClient.subscribeToResponseOf(topic);
      });

      this.logger.log('Attempting to connect to Kafka...');
      await this.kafkaClient.connect();
      this.logger.log('✅ Kafka client connected successfully');
    } catch (error) {
      this.logger.error(`❌ Failed to connect to Kafka: ${error.message}`);
      // Don't throw - allow app to continue without Kafka
      this.logger.warn(
        'Continuing without Kafka connection - some features may be limited',
      );
    }
  }

  async onModuleDestroy() {
    if (this.kafkaClient) {
      try {
        await this.kafkaClient.close();
        this.logger.log('Kafka client disconnected');
      } catch (error) {
        this.logger.error(`Error disconnecting Kafka: ${error.message}`);
      }
    }
  }

  // ==================== MESSAGE EMITTING ====================

  async emit(topic: string, data: any, correlationId?: string): Promise<void> {
    // Skip if Kafka is disabled
    if (!this.kafkaClient) {
      this.logger.debug(`Kafka disabled, skipping emit to ${topic}`);
      return;
    }

    try {
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        service: this.configService.get('config.service.name'),
      };

      const headers = {
        correlationId: correlationId || this.generateCorrelationId(),
        source: this.configService.get('config.service.name'),
        timestamp: Date.now().toString(),
      };

      this.logger.debug(`Emitting to topic ${topic}`);

      await lastValueFrom(
        this.kafkaClient.emit(topic, { value: message, headers }),
      );
    } catch (error) {
      this.logger.error(`Failed to emit to topic ${topic}: ${error.message}`);

      // Try to send to DLQ if available
      await this.sendToDLQ(topic, data, error, correlationId).catch((e) =>
        this.logger.error(`Failed to send to DLQ: ${e.message}`),
      );
    }
  }

  async send(topic: string, data: any, correlationId?: string): Promise<any> {
    // Skip if Kafka is disabled
    if (!this.kafkaClient) {
      this.logger.debug(`Kafka disabled, skipping send to ${topic}`);
      return null;
    }

    try {
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        service: this.configService.get('config.service.name'),
      };

      const headers = {
        correlationId: correlationId || this.generateCorrelationId(),
        source: this.configService.get('config.service.name'),
        timestamp: Date.now().toString(),
      };

      this.logger.debug(`Sending to topic ${topic}`);

      return await lastValueFrom(
        this.kafkaClient.send(topic, { value: message, headers }),
      );
    } catch (error) {
      this.logger.error(`Failed to send to topic ${topic}: ${error.message}`);

      await this.sendToDLQ(topic, data, error, correlationId);
      throw error;
    }
  }

  // ==================== DEAD LETTER QUEUE ====================

  private async sendToDLQ(
    originalTopic: string,
    data: any,
    error: Error,
    correlationId?: string,
  ) {
    if (!this.kafkaClient) return;

    lastValueFrom(
      this.kafkaClient.emit(KAFKA_TOPICS.AD_DLQ, {
        value: {
          originalTopic,
          originalMessage: data,
          error: {
            message: error.message,
            stack: error.stack,
          },
          timestamp: new Date().toISOString(),
          correlationId: correlationId || this.generateCorrelationId(),
        },
      }),
    ).catch((dlqError) => {
      this.logger.error(`Failed to send to DLQ: ${dlqError.message}`);
    });
  }

  // ==================== UTILITIES ====================

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getClient(): ClientKafka | null {
    return this.kafkaClient;
  }

  // ==================== HEALTH CHECK ====================

  isConnected(): boolean {
    if (!this.kafkaClient) return false;
    try {
      // You can add a simple health check here
      return true;
    } catch {
      return false;
    }
  }
}

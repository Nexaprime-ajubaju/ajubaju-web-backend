import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEvent, OutboxEventDocument } from './schemas/outbox-event.schema';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly logger = new Logger(OutboxService.name);
  private isProcessing = false;

  constructor(
    @InjectModel(OutboxEvent.name) private outboxModel: Model<OutboxEventDocument>,
    private kafkaService: KafkaService,
  ) {}

  onModuleInit() {
    this.logger.log('OutboxService initialized.');
  }

  /**
   * Save an event to the outbox to guarantee delivery even if Kafka crashes.
   */
  async saveEvent(topic: string, payload: Record<string, any>): Promise<OutboxEventDocument> {
    const event = new this.outboxModel({
      topic,
      payload,
      status: 'pending',
    });
    return event.save();
  }

  /**
   * Background processor: sweeps pending outbox events and pushes to Kafka.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutboxEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingEvents = await this.outboxModel
        .find({ status: 'pending', retryCount: { $lt: 5 } })
        .limit(50)
        .exec();

      for (const event of pendingEvents) {
        try {
          await this.kafkaService.send(event.topic, event.payload);
          
          event.status = 'processed';
          await event.save();
          this.logger.log(`Outbox event ${event._id} sent to ${event.topic}`);
        } catch (error) {
          event.retryCount += 1;
          event.lastError = error.message;
          if (event.retryCount >= 5) {
            event.status = 'failed';
          }
          await event.save();
          this.logger.error(`Failed to process outbox event ${event._id}: ${error.message}`);
        }
      }
    } catch (err) {
      this.logger.error('Error in outbox processor:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}

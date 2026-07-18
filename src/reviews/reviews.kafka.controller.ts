import { Controller, Logger, Optional } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';
import { ReviewStatus } from './schemas/review.schema';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsKafkaController {
  private readonly logger = new Logger(ReviewsKafkaController.name);

  constructor(
    private readonly reviewsService: ReviewsService,
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

  @MessagePattern(KAFKA_TOPICS.REVIEW_GET_MERCHANT)
  async handleGetMerchantReviews(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.reviewsService.getMerchantReviews(
        value.merchantId,
        Number(value.page || 1),
        Number(value.limit || 20),
        value.status,
        value.search,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed REVIEW_GET_MERCHANT: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.REVIEW_GET_STATS)
  async handleGetMerchantStats(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.reviewsService.getMerchantReviewStats(
        value.merchantId,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed REVIEW_GET_STATS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.REVIEW_UPDATE_STATUS)
  async handleUpdateReviewStatus(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.reviewsService.updateReviewStatus(
        value.merchantId,
        value.reviewId,
        value.status as ReviewStatus,
      );

      if (this.kafkaService && result?.success) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.REVIEW_STATUS_UPDATED,
          {
            reviewId: result?.data?._id,
            status: result?.data?.status,
            merchantId: value.merchantId,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed REVIEW_UPDATE_STATUS: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

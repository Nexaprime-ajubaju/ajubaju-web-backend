import { Controller, Logger } from '@nestjs/common';
import {
  MessagePattern,
  Payload,
  Ctx,
  KafkaContext,
} from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { AdsService } from '../ads/ads.service';

@Controller()
export class KafkaController {
  private readonly logger = new Logger(KafkaController.name);

  constructor(private readonly adsService: AdsService) {}

  @MessagePattern(KAFKA_TOPICS.AD_CREATE)
  async handleAdCreate(@Payload() message: any, @Ctx() context: KafkaContext) {
    const { value, headers } = message;
    const correlationId = headers?.correlationId || 'unknown';
    const startTime = Date.now();

    this.logger.log(`Received AD_CREATE request: ${correlationId}`);

    try {
      // Validate and create ad
      const result = await this.adsService.createAd(value);

      // Emit success event
      await this.adsService.emitAdCreated(result, correlationId);

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `AD_CREATE completed in ${processingTime}ms: ${correlationId}`,
      );

      return {
        success: true,
        data: result,
        correlationId,
        processingTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Error processing AD_CREATE: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        processingTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_GET)
  async handleAdGet(@Payload() message: any, @Ctx() context: KafkaContext) {
    const { value, headers } = message;
    const { adId } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      const ad = await this.adsService.getAdById(adId);

      // Increment view count
      if (ad) {
        await this.adsService.incrementViewCount(adId);
      }

      return {
        success: true,
        data: ad,
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'NOT_FOUND',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_GET_BY_CATEGORY)
  async handleAdGetByCategory(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const { value, headers } = message;
    const {
      category,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      const result = await this.adsService.getAdsByCategory(
        category,
        page,
        limit,
        sortBy,
        sortOrder,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit),
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_GET_BY_USER)
  async handleAdGetByUser(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const { value, headers } = message;
    const { userId, page = 1, limit = 10 } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      const result = await this.adsService.getAdsByUser(userId, page, limit);

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit),
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_SEARCH)
  async handleAdSearch(@Payload() message: any, @Ctx() context: KafkaContext) {
    const { value, headers } = message;
    const {
      query,
      category,
      location,
      minPrice,
      maxPrice,
      page = 1,
      limit = 10,
    } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      const filters = {
        category,
        location,
        minPrice,
        maxPrice,
      };

      const result = await this.adsService.searchAds(
        query,
        filters,
        page,
        limit,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit),
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_GET_NEARBY)
  async handleAdGetNearby(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const { value, headers } = message;
    const {
      latitude,
      longitude,
      maxDistance = 10000, // meters
      category,
      page = 1,
      limit = 10,
    } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      const result = await this.adsService.getNearbyAds(
        latitude,
        longitude,
        maxDistance,
        category,
        page,
        limit,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit),
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_UPDATE)
  async handleAdUpdate(@Payload() message: any, @Ctx() context: KafkaContext) {
    const { value, headers } = message;
    const { adId, userId, updateData } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      const updated = await this.adsService.updateAd(adId, userId, updateData);

      // Emit update event
      await this.adsService.emitAdUpdated(updated, correlationId);

      return {
        success: true,
        data: updated,
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @MessagePattern(KAFKA_TOPICS.AD_DELETE)
  async handleAdDelete(@Payload() message: any, @Ctx() context: KafkaContext) {
    const { value, headers } = message;
    const { adId, userId } = value;
    const correlationId = headers?.correlationId || 'unknown';

    try {
      await this.adsService.deleteAd(adId, userId);

      // Emit delete event
      await this.adsService.emitAdDeleted(adId, userId, correlationId);

      return {
        success: true,
        message: 'Ad deleted successfully',
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

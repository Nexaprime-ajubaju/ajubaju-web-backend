import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { BannersService } from '../banners/banners.service';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { SubmitOfferPromotionDto } from './dto/submit-offer-promotion.dto';
import { UpdateOfferPromotionDto } from './dto/update-offer-promotion.dto';

@Controller('offers')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly bannersService: BannersService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Post('request')
  @UseGuards(JwtAuthGuard)
  async submitOfferRequest(
    @Body() body: SubmitOfferPromotionDto,
    @CurrentUser() user: any,
  ) {
    try {
      const userId = user?.id || user?.sub || user?._id;
      if (!userId) {
        throw new UnauthorizedException('Authentication required');
      }

      if (!body || typeof body !== 'object') {
        throw new BadRequestException('Invalid request payload');
      }

      const payload = { ...body } as any;

      if (!payload.title || !payload.category) {
        throw new BadRequestException('Offer title and category are required');
      }

      const request = await this.offersService.submitOfferPromotionRequest(
        String(userId),
        payload,
      );

      try {
        await this.kafkaService?.emit(KAFKA_TOPICS.OFFER_PROMOTION_SUBMITTED, {
          requestId: request.requestId,
          merchantId: String(userId),
          title: request.title,
          category: request.category,
          totalPrice: request.totalPrice,
        });
      } catch (kafkaError) {
        console.error('[Offers] Kafka emit error:', kafkaError.message);
      }

      return {
        success: true,
        message: 'Offer promotion request submitted for review',
        data: request,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[Offers] Submit error:', error.message, error.stack);
      throw error;
    }
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyOffers(@CurrentUser() user: any, @Query('type') type?: string) {
    const rows = await this.offersService.listMerchantOffers(user.id);
    return { success: true, data: rows, timestamp: new Date().toISOString() };
  }

  @Put(':requestId')
  @UseGuards(JwtAuthGuard)
  async updateMyOffer(
    @Param('requestId') requestId: string,
    @Body() body: UpdateOfferPromotionDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.offersService.updateMerchantOffer(
      requestId,
      user.id,
      body,
    );
    try {
      await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_REVIEWED, {
        requestId,
        merchantId: user.id,
      });
    } catch (error) {
      console.error('[Offers] Kafka emit error:', error.message);
    }
    return {
      success: true,
      message: 'Offer updated',
      data: updated,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':requestId')
  @UseGuards(JwtAuthGuard)
  async deleteMyOffer(
    @Param('requestId') requestId: string,
    @CurrentUser() user: any,
  ) {
    const result = await this.offersService.deleteMerchantOffer(
      requestId,
      user.id,
    );
    try {
      await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_DELETED, {
        requestId,
        merchantId: user.id,
      });
    } catch (error) {
      console.error('[Offers] Kafka emit error:', error.message);
    }
    return {
      success: true,
      message: 'Offer deleted',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('nearby')
  async getNearbyOffers(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('location') location?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('offerTypes') offerTypes?: string,
    @Query('topDiscount') topDiscount?: string,
    @Query('activeNow') activeNow?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const requestPayload = {
      latitude: lat ? Number(lat) : undefined,
      longitude: lng ? Number(lng) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      location,
      query: q,
      category,
      sort,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      offerTypes: offerTypes || undefined,
      topDiscount: topDiscount === 'true' || topDiscount === '1',
      activeNow: activeNow === 'false' ? false : true,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    };

    const timeoutMs = 20000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Offers nearby request timed out')),
        timeoutMs,
      ),
    );

    let data: any;
    try {
      data = await Promise.race([
        (this.offersService as any).getNearbyOffers(requestPayload),
        timeoutPromise,
      ]);
    } catch (error) {
      console.warn(
        `[Offers] Nearby offers failed or timed out: ${error?.message || error}`,
      );
      // Important: do NOT return success with empty rows on transient failures/timeouts,
      // otherwise the UI wipes results and appears "random".
      throw new ServiceUnavailableException(
        'Failed to load nearby deals. Please try again.',
      );
    }
    if (!data || typeof data !== 'object') {
      throw new ServiceUnavailableException(
        'Failed to load nearby deals. Please try again.',
      );
    }

    return { success: true, ...data, timestamp: new Date().toISOString() };
  }

  // Template endpoints (must be BEFORE :offerId route)
  @Post('template/save')
  @UseGuards(JwtAuthGuard)
  async saveOfferTemplate(@Body() body: any, @CurrentUser() user: any) {
    const data = await this.offersService.saveOfferTemplate(user.id, body);
    return {
      success: true,
      message: 'Offer template saved successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('template')
  @UseGuards(JwtAuthGuard)
  async getOfferTemplate(@CurrentUser() user: any) {
    const data = await this.offersService.getOfferTemplate(user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Delete('template')
  @UseGuards(JwtAuthGuard)
  async clearOfferTemplate(@CurrentUser() user: any) {
    const data = await this.offersService.clearOfferTemplate(user.id);
    return {
      success: true,
      message: 'Offer template cleared successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('user/recently-viewed')
  @UseGuards(JwtAuthGuard)
  async getRecentlyViewedOffers(@CurrentUser() user: any) {
    const data = await this.offersService.getRecentlyViewedOffers(user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get(':offerId')
  async getPublicOfferDetails(
    @Param('offerId') offerId: string,
    @Req() req: Request,
  ) {
    let userId: string | undefined = undefined;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token) {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          userId = payload.sub || payload.id || payload._id;
        }
      }
    } catch (e) {
      // Ignore invalid tokens for public route
    }

    const data = await this.offersService.getPublicOfferDetails(offerId, userId);
    return { success: true, data, timestamp: new Date().toISOString() };
  }
}

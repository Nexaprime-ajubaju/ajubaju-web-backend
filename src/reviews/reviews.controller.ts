import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReviewsService } from './reviews.service';
import { RedisService } from '../common/services/redis.service';
import { ReviewStatus } from './schemas/review.schema';

@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly redisService: RedisService,
  ) {}

  @Get('offers/:offerId')
  async getOfferReviews(
    @Param('offerId') offerId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.reviewsService.getOfferReviews(
      offerId,
      Number(page),
      Number(limit),
    );
  }

  @Post('vouchers/:voucherId')
  @UseGuards(JwtAuthGuard)
  async submitOfferReview(
    @CurrentUser() user: any,
    @Param('voucherId') voucherId: string,
    @Body('rating') rating: number,
    @Body('content') content: string,
  ) {
    const userId = user?.id || user?._id;
    return this.reviewsService.submitOfferReview(userId, voucherId, {
      rating,
      content,
    });
  }

  @Get('merchant')
  @UseGuards(JwtAuthGuard)
  async getMerchantReviews(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const merchantId = user?.id || user?._id;
    return this.reviewsService.getMerchantReviews(
      merchantId,
      Number(page),
      Number(limit),
      status,
      search,
    );
  }

  @Get('merchant/stats')
  @UseGuards(JwtAuthGuard)
  async getMerchantReviewStats(@CurrentUser() user: any) {
    const merchantId = user?.id || user?._id;
    return this.reviewsService.getMerchantReviewStats(merchantId);
  }

  @Get('merchant/:merchantId/public-stats')
  async getPublicMerchantReviewStats(@Param('merchantId') merchantId: string) {
    const cacheKey = `reviews:stats:public:${merchantId}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const result =
      await this.reviewsService.getPublicMerchantReviewStats(merchantId);
    if (result && result.success) {
      await this.redisService.set(cacheKey, result, 60);
    }
    return result;
  }

  @Patch(':reviewId/status')
  @UseGuards(JwtAuthGuard)
  async updateReviewStatus(
    @CurrentUser() user: any,
    @Param('reviewId') reviewId: string,
    @Body('status') status: ReviewStatus,
  ) {
    const merchantId = user?.id || user?._id;
    return this.reviewsService.updateReviewStatus(merchantId, reviewId, status);
  }

  // ==================== PLATFORM REVIEWS ====================

  @Post('platform')
  async submitPlatformReview(
    @Body('userId') userId: string,
    @Body('rating') rating: number,
    @Body('content') content: string,
    @Body('source') source: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    let finalSource = source;

    // If source is not provided, or if it's 'website' but userAgent implies app,
    // we can override it to 'app'.
    if (!finalSource || finalSource === 'website') {
      const ua = (userAgent || '').toLowerCase();
      if (
        ua.includes('dart') ||
        ua.includes('android') ||
        ua.includes('iphone') ||
        ua.includes('okhttp')
      ) {
        finalSource = 'app';
      }
    }

    return this.reviewsService.submitPlatformReview(userId, {
      rating,
      content,
      source: finalSource || 'website',
    });
  }

  @Get('admin/platform')
  async getPlatformReviews(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.reviewsService.getPlatformReviews(Number(page), Number(limit));
  }
}

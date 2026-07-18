import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReviewsService } from './reviews.service';
import { ReviewStatus } from './schemas/review.schema';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

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
    return this.reviewsService.getPublicMerchantReviewStats(merchantId);
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
}

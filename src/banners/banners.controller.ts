import {
  Body,
  Controller,
  Put,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BannersService } from './banners.service';
import { BannerPromotionType } from './schemas/banner-promotion.schema';
import { SubmitBannerPromotionDto } from './dto/submit-banner-promotion.dto';
import { ReviewBannerPromotionDto } from './dto/review-banner-promotion.dto';
import { PayBannerPromotionDto } from './dto/pay-banner-promotion.dto';
import { UpdateBannerPromotionDto } from './dto/update-banner-promotion.dto';
import { BannerTrackingService } from './services/banner-tracking.service';
import { BannerAnalyticsService } from './services/banner-analytics.service';
import { BannerAdminService } from './services/banner-admin.service';
import { BannerServingService } from './services/banner-serving.service';

@Controller('banners')
export class BannersController {
  constructor(
    private readonly bannersService: BannersService,
    private readonly trackingService: BannerTrackingService,
    private readonly analyticsService: BannerAnalyticsService,
    private readonly adminService: BannerAdminService,
    private readonly bannerServingService: BannerServingService,
  ) {}

  @Get('promotions/check-availability')
  async checkBannerAvailability(@Query('city') city?: string) {
    const data = await this.bannersService.checkBannerAvailability(city);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('promotions/request')
  @UseGuards(JwtAuthGuard)
  async submitBannerPromotionRequest(
    @Body() body: SubmitBannerPromotionDto,
    @CurrentUser() user: any,
  ) {
    const request = await this.bannersService.submitBannerPromotionRequest(
      user.id,
      body,
    );

    return {
      success: true,
      message: 'Banner promotion approved successfully',
      data: request,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/my')
  @UseGuards(JwtAuthGuard)
  async getMyBannerPromotions(
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ) {
    const promotionType =
      type === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;
    const rows = await this.bannersService.listMerchantPromotionsByType(
      user.id,
      promotionType,
    );
    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('promotions/template/save')
  @UseGuards(JwtAuthGuard)
  async saveOfferTemplate(
    @Body()
    body: {
      formData?: Record<string, any>;
      selectedProducts?: Array<Record<string, any>>;
    },
    @CurrentUser() user: any,
  ) {
    const data = await this.bannersService.saveMerchantOfferTemplate(
      user.id,
      body,
    );
    return {
      success: true,
      message: 'Offer template saved successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/template')
  @UseGuards(JwtAuthGuard)
  async getOfferTemplate(@CurrentUser() user: any) {
    const data = await this.bannersService.getMerchantOfferTemplate(user.id);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('promotions/template')
  @UseGuards(JwtAuthGuard)
  async clearOfferTemplate(@CurrentUser() user: any) {
    const data = await this.bannersService.clearMerchantOfferTemplate(user.id);
    return {
      success: true,
      message: 'Offer template cleared successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('promotions/:requestId/pay')
  @UseGuards(JwtAuthGuard)
  async payForApprovedBannerPromotion(
    @Param('requestId') requestId: string,
    @Body() body: PayBannerPromotionDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.bannersService.markBannerPromotionAsPaid(
      requestId,
      user.id,
      body.paymentReference,
    );
    return {
      success: true,
      message: 'Payment recorded and banner activated',
      data: updated,
      timestamp: new Date().toISOString(),
    };
  }

  @Put('promotions/:requestId')
  @UseGuards(JwtAuthGuard)
  async updateMyBannerPromotion(
    @Param('requestId') requestId: string,
    @Body() body: UpdateBannerPromotionDto,
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ) {
    const promotionType =
      type === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;
    const updated = await this.bannersService.updateMerchantBannerPromotion(
      requestId,
      user.id,
      body,
      promotionType,
    );
    return {
      success: true,
      message: 'Banner promotion updated successfully',
      data: updated,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('promotions/:requestId')
  @UseGuards(JwtAuthGuard)
  async deleteMyBannerPromotion(
    @Param('requestId') requestId: string,
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ) {
    const promotionType =
      type === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;
    const result = await this.bannersService.deleteMerchantBannerPromotion(
      requestId,
      user.id,
      promotionType,
    );
    return {
      success: true,
      message: 'Banner promotion deleted successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('promotions/active')
  async getActiveHomepageBanners(
    @Query('limit') limit?: string,
    @Query('city') city?: string,
    @Query('fullLocation') fullLocationStr?: string,
  ) {
    const safeLimit = Number(limit) || 9;
    const rows = await this.bannerServingService.getActiveHomepageBanners(
      city,
      fullLocationStr,
      safeLimit,
    );

    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  // High-Throughput Async Tracking Endpoints
  @Post('promotions/impression')
  async trackBannerImpression(
    @Body()
    body: {
      bannerId: string;
      merchantId: string;
      userId?: string;
      city?: string;
      slot?: number;
      generation?: number;
    },
  ) {
    this.trackingService.trackImpression(body);
    return { success: true };
  }

  @Post('promotions/click')
  async trackBannerClick(
    @Body()
    body: {
      bannerId: string;
      merchantId: string;
      userId?: string;
      city?: string;
    },
  ) {
    this.trackingService.trackClick(body);
    return { success: true };
  }

  // Admin Monitoring & Scheduler Inspection Endpoints
  @Get('admin/promotions')
  @UseGuards(JwtAuthGuard)
  async adminListBannerPromotions(
    @Query('status') status: string,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const rows = await this.bannersService.listBannerPromotionsForAdmin(status);
    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('admin/promotions/:requestId/review')
  @UseGuards(JwtAuthGuard)
  async adminReviewBannerPromotion(
    @Param('requestId') requestId: string,
    @Body() body: ReviewBannerPromotionDto,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const result = await this.bannersService.reviewBannerPromotionRequest(
      requestId,
      body.decision,
      user.id,
      body.adminNotes,
    );

    return {
      success: true,
      message: `Banner request ${body.decision === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('admin/promotions/:requestId')
  @UseGuards(JwtAuthGuard)
  async adminDeleteBannerPromotion(
    @Param('requestId') requestId: string,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const result = await this.bannersService.deleteBannerPromotion(requestId);

    return {
      success: true,
      message: 'Banner promotion deleted successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('admin/queue')
  @UseGuards(JwtAuthGuard)
  async adminGetQueue(@Query('city') city: string, @CurrentUser() user: any) {
    this.checkAdminRole(user);
    const data = await this.adminService.getCityQueueInfo(city);
    return { success: true, data };
  }

  @Get('admin/scheduler')
  @UseGuards(JwtAuthGuard)
  async adminGetSchedulerState(
    @Query('city') city: string,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const data = await this.adminService.getSchedulerState(city);
    return { success: true, data };
  }

  @Get('admin/live-slots')
  @UseGuards(JwtAuthGuard)
  async adminGetLiveSlots(
    @Query('city') city: string,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const data = await this.adminService.getLiveSlots(city);
    return { success: true, data };
  }

  @Get('admin/analytics')
  @UseGuards(JwtAuthGuard)
  async adminGetAnalytics(
    @Query('bannerId') bannerId: string,
    @Query('merchantId') merchantId: string,
    @Query('days') days: string,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const data = await this.analyticsService.getBannerAnalytics(
      bannerId,
      merchantId,
      Number(days) || 30,
    );
    return { success: true, data };
  }

  @Get('admin/health')
  @UseGuards(JwtAuthGuard)
  async adminGetHealth(
    @Query('city') city: string,
    @CurrentUser() user: any,
  ) {
    this.checkAdminRole(user);
    const data = await this.adminService.getHealthStatus(city);
    return { success: true, data };
  }

  private checkAdminRole(user: any) {
    const role = String(user?.role || '').toLowerCase();
    const adminType = String(user?.adminType || '').toLowerCase();

    const isAllowed =
      ['admin', 'manager', 'super_admin'].includes(role) ||
      ['admin', 'manager', 'super_admin'].includes(adminType) ||
      Boolean(user?.adminType);

    if (!isAllowed) {
      throw new ForbiddenException('Only admin/manager can perform this action');
    }
  }
}

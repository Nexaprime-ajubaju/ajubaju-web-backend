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

@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

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
      message: 'Banner promotion request submitted for review',
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
  async getActiveHomepageBanners(@Query('limit') limit?: string) {
    const defaultLimit = 10;
    const safeLimit = Math.max(1, Math.min(10, Number(limit) || defaultLimit));
    const rows = await this.bannersService.getActiveHomepageBanners(safeLimit);
    return {
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('admin/promotions')
  @UseGuards(JwtAuthGuard)
  async adminListBannerPromotions(
    @Query('status') status: string,
    @CurrentUser() user: any,
  ) {
    if (
      !['admin', 'manager'].includes(String(user?.role || '').toLowerCase())
    ) {
      throw new ForbiddenException(
        'Only admin/manager can view banner moderation queue',
      );
    }

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
    if (
      !['admin', 'manager'].includes(String(user?.role || '').toLowerCase())
    ) {
      throw new ForbiddenException(
        'Only admin/manager can review banner promotions',
      );
    }

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
    if (
      !['admin', 'manager'].includes(String(user?.role || '').toLowerCase())
    ) {
      throw new ForbiddenException(
        'Only admin/manager can delete banner promotions',
      );
    }

    const result = await this.bannersService.deleteBannerPromotion(requestId);

    return {
      success: true,
      message: 'Banner promotion deleted successfully',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}

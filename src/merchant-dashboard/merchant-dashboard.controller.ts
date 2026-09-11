import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MerchantDashboardService } from './merchant-dashboard.service';

@Controller('merchant-dashboard')
@UseGuards(JwtAuthGuard)
export class MerchantDashboardController {
  constructor(
    private readonly merchantDashboardService: MerchantDashboardService,
  ) {}

  private getMerchantId(user: any) {
    return user?.id || user?._id;
  }

  @Get('summary')
  async getSummary(@CurrentUser() user: any) {
    const merchantId = this.getMerchantId(user);
    return this.merchantDashboardService.getSummary(merchantId);
  }

  @Get('analytics/device-breakdown')
  async getMerchantDeviceBreakdown(@CurrentUser() user: any) {
    return this.merchantDashboardService.getMerchantDeviceBreakdown(
      this.getMerchantId(user),
    );
  }

  @Get('analytics/top-regions')
  async getMerchantTopRegions(@CurrentUser() user: any) {
    return this.merchantDashboardService.getMerchantTopRegions(
      this.getMerchantId(user),
    );
  }

  @Get('analytics/top-products')
  async getMerchantTopProducts(@CurrentUser() user: any) {
    return this.merchantDashboardService.getMerchantTopProducts(
      this.getMerchantId(user),
    );
  }

  @Get('analytics/events')
  async getMerchantEvents(@CurrentUser() user: any) {
    return this.merchantDashboardService.getMerchantEventStats(
      this.getMerchantId(user),
    );
  }

  @Get('analytics/trend')
  async getMerchantTrend(@CurrentUser() user: any) {
    return this.merchantDashboardService.getMerchantTrend(
      this.getMerchantId(user),
    );
  }

  @Get('analytics/realtime')
  async getMerchantRealtimeAnalytics(
    @CurrentUser() user: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const merchantId = this.getMerchantId(user);
    const result = await this.merchantDashboardService.getRealtimeAnalytics(
      merchantId,
      start,
      end,
    );
    return result;
  }

  @Get('loyalty-leaderboard')
  async getLoyaltyLeaderboard(@CurrentUser() user: any) {
    const leaderboard =
      await this.merchantDashboardService.getMerchantLoyaltyLeaderboard(
        this.getMerchantId(user),
      );
    return leaderboard;
  }
}

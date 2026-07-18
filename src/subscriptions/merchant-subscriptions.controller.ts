import { Controller, Get, Post, Body, Req, UseGuards, Param } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('merchants')
export class MerchantSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':merchantId/subscription')
  async getMerchantSubscription(@Param('merchantId') merchantId: string) {
    return this.subscriptionsService.getMerchantSubscription(merchantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':merchantId/subscription')
  async assignMerchantSubscription(@Param('merchantId') merchantId: string, @Body() body: any) {
    return this.subscriptionsService.assignMerchantSubscription(merchantId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':merchantId/subscription/history')
  async getMerchantSubscriptionHistory(@Param('merchantId') merchantId: string) {
    return this.subscriptionsService.getMerchantSubscriptionHistory(merchantId);
  }
}

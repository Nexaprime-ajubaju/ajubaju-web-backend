import { Controller, Get, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getPublicPlans() {
    return this.subscriptionsService.getAllPublicPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req: any, @Body() body: { planName: string, billingCycle: 'monthly' | 'yearly' }) {
    const merchantId = req.user.id;
    return this.subscriptionsService.subscribeToPlan(merchantId, body.planName, body.billingCycle || 'monthly');
  }
}

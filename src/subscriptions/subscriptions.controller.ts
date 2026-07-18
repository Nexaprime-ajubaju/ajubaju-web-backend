import { Controller, Get, Post, Put, Delete, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getPublicPlans(@Req() req: any) {
    const isAdmin = req.query.admin === 'true';
    return this.subscriptionsService.getAllPublicPlans(isAdmin);
  }

  @UseGuards(JwtAuthGuard)
  @Post('plans')
  async createPlan(@Body() body: any) {
    return this.subscriptionsService.createPlan(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('analytics')
  async getAnalytics() {
    return this.subscriptionsService.getAnalytics();
  }

  @UseGuards(JwtAuthGuard)
  @Get('plans/:id')
  async getPlanById(@Req() req: any) {
    return this.subscriptionsService.getPlanById(req.params.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('plans/:id')
  async updatePlan(@Req() req: any, @Body() body: any) {
    return this.subscriptionsService.updatePlan(req.params.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('plans/:id')
  async deletePlan(@Req() req: any) {
    return this.subscriptionsService.deletePlan(req.params.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('plans/:planName/merchants')
  async getMerchantsByPlan(@Req() req: any) {
    return this.subscriptionsService.getMerchantsByPlan(req.params.planName);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req: any, @Body() body: { planName: string, billingCycle: 'monthly' | 'yearly' }) {
    const merchantId = req.user.id;
    return this.subscriptionsService.subscribeToPlan(merchantId, body.planName, body.billingCycle || 'monthly');
  }
}

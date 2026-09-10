import { Controller, Get, UseGuards, Request, Logger } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

@Controller('merchant/referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  private readonly logger = new Logger(ReferralsController.name);

  constructor(
    private readonly referralsService: ReferralsService,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  @Get()
  async getReferrals(@Request() req: any) {
    const userId = req.user.id || req.user.userId;
    this.logger.log(`Fetching referrals for user: ${userId}`);

    const data = await this.referralsService.getReferralStats(userId);
    
    // Fetch user directly from DB to get the true, most up-to-date referralCode
    // because old JWTs or old accounts might not have it set
    const userDoc = await this.userModel.findById(userId).exec();
    const referralCode = userDoc?.referralCode || req.user.referralCode || 'GOLO2026';
    
    // Using FRONTEND_URL from env or defaulting
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const link = `${frontendUrl}/merchant/join?ref=${referralCode}`;

    return {
      success: true,
      referralCode,
      link,
      ...data,
    };
  }
}

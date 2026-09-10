import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral, ReferralDocument, ReferralStatus } from './schemas/referral.schema';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectModel(Referral.name) private referralModel: Model<ReferralDocument>,
  ) {}

  async createReferral(referrerId: string, referredUserId: string): Promise<ReferralDocument> {
    const referral = new this.referralModel({
      referrerId: new Types.ObjectId(referrerId),
      referredUserId: new Types.ObjectId(referredUserId),
      status: ReferralStatus.PENDING,
    });
    return referral.save();
  }

  // We will call this from payments/banners service
  async processFirstPurchase(merchantUserId: string, merchantModel: any): Promise<void> {
    try {
      const pendingReferral = await this.referralModel.findOne({
        referredUserId: new Types.ObjectId(merchantUserId),
        status: ReferralStatus.PENDING,
      });

      if (!pendingReferral) {
        return; // No pending referral found for this merchant
      }

      const referrerMerchant = await merchantModel.findOne({ userId: pendingReferral.referrerId });
      
      if (!referrerMerchant) {
        this.logger.warn(`Referrer ${pendingReferral.referrerId} is not a merchant. Cannot give reward.`);
        return;
      }

      // Check if referrer has an active paid subscription
      if (referrerMerchant.subscription?.status === 'ACTIVE' && referrerMerchant.subscription?.planId) {
        const expiresAt = new Date(referrerMerchant.subscription.expiresAt);
        expiresAt.setDate(expiresAt.getDate() + 15); // Add 15 days
        
        referrerMerchant.subscription.expiresAt = expiresAt;
        await referrerMerchant.save();

        pendingReferral.status = ReferralStatus.VERIFIED;
        pendingReferral.completedAt = new Date();
        await pendingReferral.save();

        this.logger.log(`Extended subscription for referrer ${referrerMerchant.userId} by 15 days.`);
      } else {
        this.logger.warn(`Referrer ${pendingReferral.referrerId} does not have an ACTIVE subscription.`);
      }

    } catch (error) {
      this.logger.error(`Error processing referral reward: ${error.message}`, error.stack);
    }
  }

  async getReferralStats(referrerId: string): Promise<any> {
    const referrals = await this.referralModel.find({ referrerId: new Types.ObjectId(referrerId) }).populate('referredUserId', 'name accountType profilePhoto createdAt');
    
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(r => r.status === ReferralStatus.VERIFIED).length;
    const pendingReferrals = referrals.filter(r => r.status === ReferralStatus.PENDING).length;
    const totalRewards = referrals.filter(r => r.status === ReferralStatus.VERIFIED).reduce((acc, curr) => acc + curr.rewardDays, 0);

    const history = referrals.map(r => ({
      id: r._id,
      name: (r.referredUserId as any)?.name || 'Unknown User',
      type: (r.referredUserId as any)?.accountType === 'merchant' ? 'Merchant' : 'User',
      date: (r as any).createdAt || new Date(),
      status: r.status,
      reward: r.status === ReferralStatus.VERIFIED ? r.rewardDays : null,
    }));

    return {
      stats: {
        totalReferrals,
        activeReferrals,
        pendingReferrals,
        totalRewards,
      },
      history: history.sort((a, b) => {
        const aTime = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
        const bTime = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
        return bTime - aTime;
      }),
    };
  }
}

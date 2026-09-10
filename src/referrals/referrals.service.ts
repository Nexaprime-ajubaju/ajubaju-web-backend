import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral, ReferralDocument, ReferralStatus } from './schemas/referral.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscriptions/schemas/subscription-plan.schema';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectModel(Referral.name) private referralModel: Model<ReferralDocument>,
    @InjectModel(Merchant.name) private merchantModel: Model<MerchantDocument>,
    @InjectModel(SubscriptionPlan.name) private subscriptionPlanModel: Model<SubscriptionPlanDocument>,
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

      // Just mark it as QUALIFIED so they can claim it manually later
      pendingReferral.status = ReferralStatus.QUALIFIED;
      await pendingReferral.save();

      this.logger.log(`Marked referral ${pendingReferral._id} as QUALIFIED for referrer ${pendingReferral.referrerId}. Purchase completed.`);

    } catch (error) {
      this.logger.error(`Error processing referral reward: ${error.message}`, error.stack);
    }
  }

  async claimReward(referrerId: string, referralId: string): Promise<any> {
    const referral = await this.referralModel.findOne({
      _id: new Types.ObjectId(referralId),
      referrerId: new Types.ObjectId(referrerId),
      status: ReferralStatus.QUALIFIED,
    });

    if (!referral) {
      throw new BadRequestException('Referral not found or not ready to claim.');
    }

    const merchant = await this.merchantModel.findOne({ userId: referrerId });
    if (!merchant) {
      throw new BadRequestException('Merchant account not found.');
    }

    // Check if merchant is on a paid tier
    if (!merchant.subscription || !merchant.subscription.planId || merchant.subscription.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot claim reward on the Free tier. Please upgrade to a Paid plan to claim your 15-day extension.');
    }

    const plan = await this.subscriptionPlanModel.findOne({ name: merchant.subscription.planId });
    if (!plan || plan.price === 0 || plan.name.toLowerCase().includes('free') || plan.name.toLowerCase().includes('basic')) {
      throw new BadRequestException('Cannot claim reward on the Free tier. Please upgrade to a Paid plan to claim your 15-day extension.');
    }

    // Extends subscription
    const expiresAt = merchant.subscription.expiresAt ? new Date(merchant.subscription.expiresAt) : new Date();
    expiresAt.setDate(expiresAt.getDate() + 15); // Add 15 days
    
    merchant.subscription.expiresAt = expiresAt;
    await merchant.save();

    referral.status = ReferralStatus.VERIFIED;
    referral.completedAt = new Date();
    await referral.save();

    this.logger.log(`Extended subscription for referrer ${merchant.userId} by 15 days. Referral ${referral._id} CLAIMED.`);
    return { success: true, message: 'Reward claimed successfully. Your subscription has been extended by 15 days.' };
  }

  async getReferralStats(referrerId: string): Promise<any> {
    const referrals = await this.referralModel.find({ referrerId: new Types.ObjectId(referrerId) }).populate('referredUserId', 'name accountType profilePhoto createdAt');
    
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(r => r.status === ReferralStatus.VERIFIED || r.status === ReferralStatus.QUALIFIED).length;
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

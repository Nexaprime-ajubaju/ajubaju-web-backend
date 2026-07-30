import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BannerPromotion, BannerPromotionDocument } from '../schemas/banner-promotion.schema';
import { BannerQueue, BannerQueueDocument } from '../schemas/banner-queue.schema';
import { BannerEligibilityService } from './banner-eligibility.service';

@Injectable()
export class BannerQueueService {
  private readonly logger = new Logger(BannerQueueService.name);

  // Plan Tier Weights for Deterministic Queue Ordering
  private readonly TIER_WEIGHTS: Record<string, number> = {
    premium: 3,
    pro: 2,
    starter: 1,
    free: 1,
  };

  constructor(
    @InjectModel(BannerPromotion.name)
    private readonly bannerPromotionModel: Model<BannerPromotionDocument>,
    @InjectModel(BannerQueue.name)
    private readonly bannerQueueModel: Model<BannerQueueDocument>,
    private readonly eligibilityService: BannerEligibilityService,
  ) {}

  /**
   * Rebuild queue for a specific city on events (Approval, Expiry, Payment, etc.)
   * Uses Deterministic Priority Ordering: Premium (3) > Pro (2) > Starter (1) -> paidAt -> createdAt
   */
  async rebuildCityQueue(city: string): Promise<any> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    this.logger.log(`Rebuilding deterministic priority banner queue for city: ${cityNormalized}`);

    const now = new Date();
    this.logger.log('Starting rebuildCityQueue Mongoose query...');
    const queryStart = Date.now();
    const allCandidates = await this.bannerPromotionModel
      .find({
        status: { $in: ['approved', 'active'] },
        isHomepageVisible: true,
      })
      .select('requestId status isHomepageVisible promotionType endDate targetCities subscriptionPlan paidAt createdAt')
      .lean()
      .exec();
    this.logger.log(`rebuildCityQueue query finished in ${Date.now() - queryStart}ms. Found ${allCandidates.length} docs`);

    // 1. Filter through Eligibility Pipeline
    const eligible = allCandidates.filter((c: any) =>
      this.eligibilityService.isEligibleForCity(c, cityNormalized, now),
    );

    // 2. Deterministic Priority Sorting
    eligible.sort((a: any, b: any) => {
      const tierA = (a.subscriptionPlan || 'starter').toLowerCase();
      const tierB = (b.subscriptionPlan || 'starter').toLowerCase();

      const weightA = this.TIER_WEIGHTS[tierA] || 1;
      const weightB = this.TIER_WEIGHTS[tierB] || 1;

      if (weightA !== weightB) {
        return weightB - weightA;
      }

      const paidA = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const paidB = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      if (paidA !== paidB) {
        return paidB - paidA;
      }

      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdB - createdA;
    });

    const MAX_QUEUE_CAPACITY = 200;
    const queueRequestIds = eligible.map((c: any) => c.requestId).slice(0, MAX_QUEUE_CAPACITY);

    let existingQueue = await this.bannerQueueModel.findOne({ city: cityNormalized }).exec();

    const newPendingVersion = existingQueue ? existingQueue.pendingVersion + 1 : 1;
    const activeVer = existingQueue ? existingQueue.activeVersion : 1;

    if (!existingQueue) {
      existingQueue = new this.bannerQueueModel({
        city: cityNormalized,
        queue: queueRequestIds,
        version: newPendingVersion,
        activeVersion: activeVer,
        pendingVersion: newPendingVersion,
        totalCampaigns: queueRequestIds.length,
        updatedAt: now,
      });
    } else {
      existingQueue.queue = queueRequestIds;
      existingQueue.version = newPendingVersion;
      existingQueue.pendingVersion = newPendingVersion;
      existingQueue.totalCampaigns = queueRequestIds.length;
      existingQueue.updatedAt = now;
    }

    await existingQueue.save();
    this.logger.log(`City queue for [${cityNormalized}] updated to pendingVersion ${newPendingVersion} with ${queueRequestIds.length} items`);
    return existingQueue;
  }

  /**
   * Commit pendingVersion to activeVersion after full cycle
   */
  async commitActiveVersion(city: string): Promise<void> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    const queueDoc = await this.bannerQueueModel.findOne({ city: cityNormalized }).exec();
    if (queueDoc && queueDoc.activeVersion !== queueDoc.pendingVersion) {
      queueDoc.activeVersion = queueDoc.pendingVersion;
      await queueDoc.save();
      this.logger.log(`Committed pending queue version ${queueDoc.activeVersion} to active for city [${cityNormalized}]`);
    }
  }

  /**
   * Get active queue for a city, or auto-rebuild if missing
   */
  async getCityQueue(city: string): Promise<any> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    let queueDoc = await this.bannerQueueModel.findOne({ city: cityNormalized }).exec();
    if (!queueDoc) {
      queueDoc = await this.rebuildCityQueue(cityNormalized);
    }
    return queueDoc;
  }
}

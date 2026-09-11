import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BannerPromotion,
  BannerPromotionDocument,
} from '../schemas/banner-promotion.schema';
import {
  BannerQueue,
  BannerQueueDocument,
} from '../schemas/banner-queue.schema';
import { BannerEligibilityService } from './banner-eligibility.service';
import { RegionsService } from '../../regions/regions.service';
import { forwardRef, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class BannerQueueService {
  private readonly logger = new Logger(BannerQueueService.name);

  // Removed TIER_WEIGHTS as banners are no longer prioritized by subscription plan

  constructor(
    @InjectModel(BannerPromotion.name)
    private readonly bannerPromotionModel: Model<BannerPromotionDocument>,
    @InjectModel(BannerQueue.name)
    private readonly bannerQueueModel: Model<BannerQueueDocument>,
    private readonly eligibilityService: BannerEligibilityService,
    @Inject(forwardRef(() => RegionsService))
    private readonly regionsService: RegionsService,
  ) {}

  /**
   * Rebuild queue for a specific city on events (Approval, Expiry, Payment, etc.)
   * Uses Deterministic Priority Ordering: Premium (3) > Pro (2) > Starter (1) -> paidAt -> createdAt
   */
  async rebuildCityQueue(city: string): Promise<any> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    this.logger.log(
      `Rebuilding deterministic priority banner queue for city: ${cityNormalized}`,
    );

    const now = new Date();

    // Auto-expire active promotions whose endDate is in the past
    await this.bannerPromotionModel
      .updateMany(
        {
          status: 'active',
          endDate: { $lt: now },
        },
        {
          $set: {
            status: 'expired',
            isHomepageVisible: false,
          },
        },
      )
      .exec();

    // 1. Resolve Hierarchy (Town -> City -> District)
    const hierarchy =
      await this.regionsService.resolveHierarchy(cityNormalized);
    const targetCities = new Set<string>();
    targetCities.add(cityNormalized);
    if (hierarchy) {
      if (hierarchy.name) targetCities.add(hierarchy.name.toLowerCase());
      if (hierarchy.district)
        targetCities.add(hierarchy.district.toLowerCase());
      // we might want to also add the exact coverageRegion match but let's query broadly
    }

    // Add "global" as a target just in case
    targetCities.add('global');

    this.logger.log('Starting rebuildCityQueue Mongoose query...');
    const queryStart = Date.now();
    const allCandidates = await this.bannerPromotionModel
      .find({
        status: { $in: ['approved', 'active'] },
        isHomepageVisible: true,
      })
      .select(
        'requestId status isHomepageVisible promotionType endDate targetCities coverageType subscriptionPlan paidAt createdAt',
      )
      .lean()
      .exec();
    this.logger.log(
      `rebuildCityQueue query finished in ${Date.now() - queryStart}ms. Found ${allCandidates.length} docs`,
    );

    // 2. Filter through Eligibility Pipeline
    // Modified to accept if targetCities matches ANY of our hierarchy levels or global
    const eligible = allCandidates.filter((c: any) => {
      // Basic checks
      if (
        !['approved', 'active'].includes(c.status) ||
        c.isHomepageVisible === false ||
        (c.promotionType && c.promotionType !== 'banner')
      ) {
        return false;
      }
      if (c.endDate) {
        const end = new Date(c.endDate);
        if (!isNaN(end.getTime()) && end < now) {
          return false;
        }
      }
      // Geospatial / Hierarchy Match
      if (c.targetCities && c.targetCities.length > 0) {
        const matchesCity = c.targetCities.some((tc: string) =>
          targetCities.has(String(tc).trim().toLowerCase()),
        );
        if (!matchesCity) {
          return false;
        }
        // When rebuilding a LOCAL city queue (not 'global'), exclude banners that
        // are purely global. Global banners live in the 'global' queue and are used
        // as a fallback by the serving layer only when no local banners exist.
        // Without this, global banners would steal local slots (e.g. districtQueue
        // slots 1-5), causing "8 merchant + 2 global" instead of showing all 10 local.
        if (cityNormalized !== 'global') {
          const isGlobalOnly = c.targetCities.every(
            (tc: string) => String(tc).trim().toLowerCase() === 'global',
          );
          if (isGlobalOnly) {
            return false;
          }
        }
      }
      return true;
    });

    // 3. Simple chronological sorting to cycle fairly, no tier bias
    eligible.sort((a: any, b: any) => {
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdB - createdA;
    });

    const MAX_QUEUE_CAPACITY = 10000; // Large capacity to guarantee all active banners are queued

    // 4. Bucket into Tiers
    const districtQueue: string[] = [];
    const cityQueue: string[] = [];
    const townQueue: string[] = [];

    for (const c of eligible) {
      if (c.coverageType === 'District') {
        if (districtQueue.length < MAX_QUEUE_CAPACITY)
          districtQueue.push(c.requestId);
      } else if (c.coverageType === 'City') {
        if (cityQueue.length < MAX_QUEUE_CAPACITY) cityQueue.push(c.requestId);
      } else if (c.coverageType === 'Town') {
        if (townQueue.length < MAX_QUEUE_CAPACITY) townQueue.push(c.requestId);
      } else {
        // Fallback for older banners without coverageType or global banners
        if (districtQueue.length < MAX_QUEUE_CAPACITY)
          districtQueue.push(c.requestId);
      }
    }

    let existingQueue = await this.bannerQueueModel
      .findOne({ city: cityNormalized })
      .exec();

    const newPendingVersion = existingQueue
      ? existingQueue.pendingVersion + 1
      : 1;
    const activeVer = existingQueue ? existingQueue.activeVersion : 1;
    const totalCampaigns =
      districtQueue.length + cityQueue.length + townQueue.length;

    if (!existingQueue) {
      existingQueue = new this.bannerQueueModel({
        city: cityNormalized,
        queue: [], // Legacy
        districtQueue,
        cityQueue,
        townQueue,
        version: newPendingVersion,
        activeVersion: activeVer,
        pendingVersion: newPendingVersion,
        totalCampaigns,
        updatedAt: now,
      });
    } else {
      existingQueue.queue = []; // Clear legacy
      existingQueue.districtQueue = districtQueue;
      existingQueue.cityQueue = cityQueue;
      existingQueue.townQueue = townQueue;
      existingQueue.version = newPendingVersion;
      existingQueue.pendingVersion = newPendingVersion;
      existingQueue.totalCampaigns = totalCampaigns;
      existingQueue.updatedAt = now;
    }

    await existingQueue.save();
    this.logger.log(
      `City queue for [${cityNormalized}] updated to pendingVersion ${newPendingVersion} with D:${districtQueue.length}, C:${cityQueue.length}, T:${townQueue.length} items`,
    );
    return existingQueue;
  }

  /**
   * Commit pendingVersion to activeVersion after full cycle
   */
  async commitActiveVersion(city: string): Promise<void> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    const queueDoc = await this.bannerQueueModel
      .findOne({ city: cityNormalized })
      .exec();
    if (queueDoc && queueDoc.activeVersion !== queueDoc.pendingVersion) {
      queueDoc.activeVersion = queueDoc.pendingVersion;
      await queueDoc.save();
      this.logger.log(
        `Committed pending queue version ${queueDoc.activeVersion} to active for city [${cityNormalized}]`,
      );
    }
  }

  // Rebuild all city queues every 1 minute for near-realtime updates
  @Cron('0 * * * * *')
  async handleScheduledRebuild() {
    const queueCities = await this.bannerQueueModel.distinct('city').exec();
    const activePromoCities = await this.bannerPromotionModel
      .distinct('targetCities', { status: 'active' })
      .exec();
    const allCities = new Set([
      ...queueCities,
      ...activePromoCities.map((c: string) => c.toLowerCase()),
      'global',
    ]);

    for (const city of Array.from(allCities)) {
      await this.rebuildCityQueue(city);
      await this.commitActiveVersion(city);
    }
  }

  /**
   * Get active queue for a city, or auto-rebuild if missing
   */
  async getCityQueue(city: string): Promise<any> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    let queueDoc = await this.bannerQueueModel
      .findOne({ city: cityNormalized })
      .exec();
    if (!queueDoc) {
      queueDoc = await this.rebuildCityQueue(cityNormalized);
    }
    return queueDoc;
  }
}

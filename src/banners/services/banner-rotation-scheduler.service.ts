import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { BannerSchedulerState, BannerSchedulerStateDocument } from '../schemas/banner-scheduler-state.schema';
import { BannerPromotion, BannerPromotionDocument } from '../schemas/banner-promotion.schema';
import { BannerQueueService } from './banner-queue.service';
import { BannerCacheService } from './banner-cache.service';
import { BannerRotationPolicyService } from './banner-rotation-policy.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BannerRotationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BannerRotationSchedulerService.name);
  private readonly instanceId = randomUUID();

  private readonly GROUPS: Record<string, number[]> = {
    A: [1, 5, 9],
    B: [2, 6, 10],
    C: [3, 7],
    D: [4, 8],
  };

  private readonly NEXT_GROUP: Record<string, string> = {
    A: 'B',
    B: 'C',
    C: 'D',
    D: 'A',
  };

  constructor(
    @InjectModel(BannerSchedulerState.name)
    private readonly schedulerStateModel: Model<BannerSchedulerStateDocument>,
    @InjectModel(BannerPromotion.name)
    private readonly bannerPromotionModel: Model<BannerPromotionDocument>,
    private readonly queueService: BannerQueueService,
    private readonly cacheService: BannerCacheService,
    private readonly policyService: BannerRotationPolicyService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async onModuleInit() {
    this.logger.log(`Banner Rotation Scheduler initialized [Node Instance: ${this.instanceId}]`);
    // Run recovery asynchronously in background without blocking NestJS HTTP server startup
    setImmediate(() => {
      this.recoverOnStartup().catch((err) =>
        this.logger.error(`Startup recovery background error: ${err.message}`),
      );
    });
  }

  /**
   * Startup Crash Recovery
   */
  async recoverOnStartup() {
    try {
      const states = await this.schedulerStateModel.find({ isRunning: true }).exec();
      for (const state of states) {
        const slots = await this.cacheService.getAllSlots(state.city);
        if (!slots || Object.keys(slots).length === 0) {
          this.logger.warn(`Startup recovery: Repopulating empty Redis Hash slots for city [${state.city}]`);
          await this.rotateCitySlots(state.city);
        }
      }
    } catch (err: any) {
      this.logger.error(`Startup recovery error: ${err.message}`);
    }
  }

  /**
   * Distributed Lock Acquisition via Redis (PX 10000 NX)
   */
  private async acquireDistributedLock(city: string): Promise<boolean> {
    if (!this.redisService || !this.redisService.isEnabled()) return true;
    const client = this.redisService.getClient();
    if (!client) return true;

    try {
      const lockKey = `banner:lock:${(city || 'global').toLowerCase()}`;
      const result = await client.set(lockKey, this.instanceId, {
        PX: 10000,
        NX: true,
      });
      return result === 'OK';
    } catch (err: any) {
      this.logger.error(`Redis lock error for ${city}: ${err.message}`);
      return true;
    }
  }

  private async releaseDistributedLock(city: string): Promise<void> {
    if (!this.redisService || !this.redisService.isEnabled()) return;
    const client = this.redisService.getClient();
    if (!client) return;

    try {
      const lockKey = `banner:lock:${(city || 'global').toLowerCase()}`;
      const lockVal = await client.get(lockKey);
      if (lockVal === this.instanceId) {
        await client.del(lockKey);
      }
    } catch (err: any) {
      this.logger.error(`Release lock error for ${city}: ${err.message}`);
    }
  }

  /**
   * Run rotation cron every 4 minutes across cities (3 slots change per rotation)
   */
  @Cron('0 * * * * *')
  async handleScheduledRotation() {
    try {
      let states: BannerSchedulerStateDocument[] = await this.schedulerStateModel.find({ isRunning: true }).exec();
      if (!states || states.length === 0) {
        states = [await this.getOrCreateState('global')];
      }

      for (const state of states) {
        const lockAcquired = await this.acquireDistributedLock(state.city);
        if (!lockAcquired) {
          this.logger.debug(`Skipping rotation for [${state.city}] - Lock held by another cluster instance`);
          continue;
        }

        try {
          await this.rotateCitySlots(state.city);
        } finally {
          await this.releaseDistributedLock(state.city);
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler rotation error: ${err.message}`, err.stack);
    }
  }

  /**
   * Perform staggered group slot rotation for a city (Zero-Mongo Campaign Query)
   */
  async rotateCitySlots(city: string) {
    const startTime = Date.now();
    const cityNormalized = (city || 'global').trim().toLowerCase();
    const state = await this.getOrCreateState(cityNormalized);
    const queueDoc = await this.queueService.getCityQueue(cityNormalized);
    
    // Fetch global queue for ultimate fallback
    const globalQueueDoc = cityNormalized !== 'global' ? await this.queueService.getCityQueue('global') : queueDoc;

    const districtQueue = queueDoc?.districtQueue || [];
    const cityQueue = queueDoc?.cityQueue || [];
    const townQueue = queueDoc?.townQueue || [];
    
    // Fallback logic for legacy queue format
    const legacyGlobalQueue = globalQueueDoc?.queue || [];
    const globalQueue = globalQueueDoc?.districtQueue?.length ? 
        globalQueueDoc.districtQueue.concat(globalQueueDoc.cityQueue || [], globalQueueDoc.townQueue || []) : 
        legacyGlobalQueue;

    // Collect all campaigns
    const allRequestIds = [...new Set([...districtQueue, ...cityQueue, ...townQueue, ...globalQueue])];
    
    if (allRequestIds.length === 0) {
      state.lastHeartbeat = new Date();
      await state.save();
      // Clear Redis cache slots since there are no active promotions
      await this.cacheService.setAllSlots(cityNormalized, {});
      return;
    }

    const currentGroup = state.activeGroup || 'A';
    let activeSlots = (await this.cacheService.getAllSlots(cityNormalized)) || {};

    // Remove any existing slots whose banner is no longer active/eligible
    for (const [slotNum, slotData] of Object.entries(activeSlots)) {
      if (slotData && slotData.requestId && !allRequestIds.includes(slotData.requestId)) {
        delete activeSlots[slotNum];
      }
    }

    const slotsToRotate = Object.keys(activeSlots).length < 10
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      : (this.GROUPS[currentGroup] || [1, 5, 9]);

    let duplicateSkips = 0;
    const displayedMerchants = new Set<string>();
    const displayedBanners = new Set<string>();

    for (const [slotNum, slotData] of Object.entries(activeSlots)) {
      if (!slotsToRotate.includes(parseInt(slotNum, 10)) && slotData) {
        if (slotData.merchantId) displayedMerchants.add(slotData.merchantId);
        if (slotData.requestId) displayedBanners.add(slotData.requestId);
      }
    }

    this.logger.log('Starting rotateCitySlots Mongoose query...');
    const queryStart = Date.now();
    const candidateCampaigns = await this.bannerPromotionModel
      .find({ requestId: { $in: allRequestIds } })
      .select('requestId merchantId merchantName bannerTitle imageUrl recommendedSize bannerCategory')
      .lean()
      .exec();
    this.logger.log(`rotateCitySlots query finished in ${Date.now() - queryStart}ms. Found ${candidateCampaigns.length} docs`);

    const campaignMap = new Map<string, any>();
    candidateCampaigns.forEach((c: any) => campaignMap.set(c.requestId, c));

    // Helper to find a banner from a specific queue
    const tryAssignFromQueue = async (q: string[], pointerKey: 'districtPointer' | 'cityPointer' | 'townPointer' | 'globalPointer', slotNum: number, forceFallback = false) => {
      if (!q || q.length === 0) return false;
      let attempts = 0;
      let assigned = false;
      const maxAttempts = q.length * 2;
      
      while (attempts < maxAttempts) {
        state[pointerKey] = state[pointerKey] % q.length;
        const requestId = q[state[pointerKey]];
        state[pointerKey] = (state[pointerKey] + 1) % q.length;
        attempts++;

        const campaign = campaignMap.get(requestId);
        if (!campaign) continue;

        const isDuplicate = this.policyService.checkDuplicateSlot(requestId, campaign.merchantId, displayedBanners, displayedMerchants, q.length);
        const inCooldown = await this.policyService.isMerchantInCooldown(campaign.merchantId, cityNormalized, q.length);

        if (isDuplicate || inCooldown) {
          duplicateSkips++;
          continue;
        }

        activeSlots[slotNum] = {
          requestId: campaign.requestId,
          merchantId: campaign.merchantId,
          merchantName: campaign.merchantName,
          bannerTitle: campaign.bannerTitle,
          imageUrl: campaign.imageUrl,
          recommendedSize: campaign.recommendedSize,
          bannerCategory: campaign.bannerCategory,
          slot: slotNum,
          generation: state.generation + 1,
          expiresAt: new Date(Date.now() + 300 * 1000),
        };

        displayedMerchants.add(campaign.merchantId);
        displayedBanners.add(campaign.requestId);
        await this.policyService.setMerchantCooldown(campaign.merchantId, cityNormalized, 5);
        assigned = true;
        break;
      }
      
      // Fallback if no valid banner without cooldown (only if forceFallback is true)
      if (!assigned && forceFallback && q.length > 0) {
        const fallbackId = q[0];
        const campaign = campaignMap.get(fallbackId);
        if (campaign) {
          activeSlots[slotNum] = {
            requestId: campaign.requestId,
            merchantId: campaign.merchantId,
            merchantName: campaign.merchantName,
            bannerTitle: campaign.bannerTitle,
            imageUrl: campaign.imageUrl,
            recommendedSize: campaign.recommendedSize,
            bannerCategory: campaign.bannerCategory,
            slot: slotNum,
            generation: state.generation + 1,
            expiresAt: new Date(Date.now() + 300 * 1000),
          };
          assigned = true;
        }
      }
      return assigned;
    };

    for (const slotNum of slotsToRotate) {
      let assigned = false;

      if (slotNum >= 1 && slotNum <= 5) {
        // District preferred
        assigned = await tryAssignFromQueue(districtQueue, 'districtPointer', slotNum);
        if (!assigned) assigned = await tryAssignFromQueue(cityQueue, 'cityPointer', slotNum);
        if (!assigned) assigned = await tryAssignFromQueue(townQueue, 'townPointer', slotNum);
      } else if (slotNum >= 6 && slotNum <= 8) {
        // City preferred
        assigned = await tryAssignFromQueue(cityQueue, 'cityPointer', slotNum);
        if (!assigned) assigned = await tryAssignFromQueue(townQueue, 'townPointer', slotNum);
        if (!assigned) assigned = await tryAssignFromQueue(districtQueue, 'districtPointer', slotNum);
      } else if (slotNum >= 9 && slotNum <= 10) {
        // Town preferred
        assigned = await tryAssignFromQueue(townQueue, 'townPointer', slotNum);
        if (!assigned) assigned = await tryAssignFromQueue(cityQueue, 'cityPointer', slotNum);
        if (!assigned) assigned = await tryAssignFromQueue(districtQueue, 'districtPointer', slotNum);
      }

      // Global Fallback
      if (!assigned) {
        assigned = await tryAssignFromQueue(globalQueue, 'globalPointer', slotNum);
      }

      // Last resort forced fallback removed as per user request.
      // If we cannot find a unique banner, we leave the slot empty so the frontend can fill it with platform banners.
      if (!assigned) {
        delete activeSlots[slotNum];
      }
    }

    // Save updated slots to Redis Hash and In-Memory fallback (Includes HMAC Signatures)
    await this.cacheService.setAllSlots(cityNormalized, activeSlots);

    await this.queueService.commitActiveVersion(cityNormalized);

    const durationMs = Date.now() - startTime;

    state.generation += 1;
    state.activeGroup = this.NEXT_GROUP[currentGroup] || 'B';
    state.queueVersion = queueDoc?.activeVersion || 1;
    state.lastRotation = new Date();
    state.nextRotation = new Date(Date.now() + 240000); // 4 minutes rotation interval
    state.lastHeartbeat = new Date();
    state.isRunning = true;
    state.rotationTimeMs = durationMs;
    state.duplicateSkips = duplicateSkips;

    await state.save();
  }

  async getOrCreateState(city: string): Promise<BannerSchedulerStateDocument> {
    const cityNormalized = (city || 'global').trim().toLowerCase();
    let state = await this.schedulerStateModel.findOne({ city: cityNormalized }).exec();
    if (!state) {
      state = new this.schedulerStateModel({
        city: cityNormalized,
        pointer: 0,
        generation: 1,
        activeGroup: 'A',
        queueVersion: 1,
        lastRotation: new Date(),
        nextRotation: new Date(Date.now() + 240000),
        isRunning: true,
        lastHeartbeat: new Date(),
      });
      await state.save();
    }
    return state;
  }
}

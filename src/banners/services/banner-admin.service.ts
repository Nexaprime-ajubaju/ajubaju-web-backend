import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BannerQueue,
  BannerQueueDocument,
} from '../schemas/banner-queue.schema';
import {
  BannerSchedulerState,
  BannerSchedulerStateDocument,
} from '../schemas/banner-scheduler-state.schema';
import { BannerCacheService } from './banner-cache.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BannerAdminService {
  private readonly logger = new Logger(BannerAdminService.name);

  constructor(
    @InjectModel(BannerQueue.name)
    private readonly bannerQueueModel: Model<BannerQueueDocument>,
    @InjectModel(BannerSchedulerState.name)
    private readonly schedulerStateModel: Model<BannerSchedulerStateDocument>,
    private readonly cacheService: BannerCacheService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async getCityQueueInfo(city: string = 'global') {
    const cityNormalized = city.trim().toLowerCase();
    const doc = await this.bannerQueueModel
      .findOne({ city: cityNormalized })
      .exec();
    return (
      doc || {
        city: cityNormalized,
        queue: [],
        version: 0,
        activeVersion: 0,
        pendingVersion: 0,
        totalCampaigns: 0,
      }
    );
  }

  async getSchedulerState(city: string = 'global') {
    const cityNormalized = city.trim().toLowerCase();
    const doc = await this.schedulerStateModel
      .findOne({ city: cityNormalized })
      .exec();
    return (
      doc || {
        city: cityNormalized,
        pointer: 0,
        generation: 0,
        activeGroup: 'A',
        queueVersion: 0,
        isRunning: false,
        rotationTimeMs: 0,
        duplicateSkips: 0,
      }
    );
  }

  async getLiveSlots(city: string = 'global') {
    const cityNormalized = city.trim().toLowerCase();
    const slots = (await this.cacheService.getAllSlots(cityNormalized)) || {};
    return {
      city: cityNormalized,
      slots,
      timestamp: new Date(),
    };
  }

  async getHealthStatus(city: string = 'global') {
    const cityNormalized = city.trim().toLowerCase();
    const state = await this.getSchedulerState(cityNormalized);
    const queue = await this.getCityQueueInfo(cityNormalized);
    const redisConnected = this.redisService
      ? this.redisService.isEnabled()
      : false;

    const lastHeartbeat = (state as any).lastHeartbeat
      ? new Date((state as any).lastHeartbeat)
      : null;
    const isHealthy =
      redisConnected &&
      state.isRunning &&
      lastHeartbeat &&
      Date.now() - lastHeartbeat.getTime() < 120000;

    return {
      status: isHealthy ? 'UP' : 'DEGRADED',
      city: cityNormalized,
      redisConnected,
      schedulerRunning: state.isRunning,
      activeVersion: queue.activeVersion,
      pendingVersion: queue.pendingVersion,
      pointer: state.pointer,
      generation: state.generation,
      queueLength: queue.totalCampaigns,
      rotationTimeMs: (state as any).rotationTimeMs || 0,
      duplicateSkips: (state as any).duplicateSkips || 0,
      lastHeartbeat,
      timestamp: new Date(),
    };
  }
}

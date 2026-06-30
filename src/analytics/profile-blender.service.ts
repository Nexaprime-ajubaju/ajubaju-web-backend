import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserInterestProfile, UserInterestProfileDocument } from './schemas/user-interest-profile.schema';
import { RedisService } from '../common/services/redis.service';

export interface BlendedInterestProfile {
  userId: string;
  confidence: number;
  tags: Record<string, number>;
  categories: Record<string, number>;
  merchants: Record<string, number>;
}

@Injectable()
export class ProfileBlenderService {
  private readonly logger = new Logger(ProfileBlenderService.name);
  
  // Blend weights
  private readonly ST_WEIGHT = 0.7;
  private readonly LT_WEIGHT = 0.3;

  constructor(
    @InjectModel(UserInterestProfile.name) private readonly profileModel: Model<UserInterestProfileDocument>,
    private readonly redisService: RedisService
  ) {}

  async blendAndCache(userId: string): Promise<void> {
    if (!this.redisService.isEnabled()) return;

    const doc = await this.profileModel.findOne({ userId }).lean();
    if (!doc) return;

    const profile: BlendedInterestProfile = {
      userId: doc.userId,
      confidence: doc.confidence || 0,
      tags: this.blendAndNormalize(doc.shortTerm?.tags, doc.longTerm?.tags),
      categories: this.blendAndNormalize(doc.shortTerm?.categories, doc.longTerm?.categories),
      merchants: this.blendAndNormalize(doc.shortTerm?.merchants, doc.longTerm?.merchants),
    };

    // Cache indefinitely until next update or decay
    await this.redisService.set(`interest-profile:${userId}`, profile, 86400); // 24 hours
  }

  async getBlendedProfile(userId: string): Promise<BlendedInterestProfile | null> {
    const cacheKey = `interest-profile:${userId}`;
    if (this.redisService.isEnabled()) {
      return await this.redisService.get<BlendedInterestProfile>(cacheKey);
    }
    return null;
  }

  private blendAndNormalize(st: Record<string, number> = {}, lt: Record<string, number> = {}): Record<string, number> {
    const blended: Record<string, number> = {};
    let maxScore = 0;

    const keys = new Set([...Object.keys(st), ...Object.keys(lt)]);
    
    for (const key of keys) {
      const stScore = st[key] || 0;
      const ltScore = lt[key] || 0;
      
      const score = (stScore * this.ST_WEIGHT) + (ltScore * this.LT_WEIGHT);
      if (score > 0) {
        blended[key] = score;
        if (score > maxScore) maxScore = score;
      }
    }

    // Normalize
    if (maxScore > 0) {
      for (const key of Object.keys(blended)) {
        blended[key] = Math.round((blended[key] / maxScore) * 100) / 100;
      }
    }

    return blended;
  }
}

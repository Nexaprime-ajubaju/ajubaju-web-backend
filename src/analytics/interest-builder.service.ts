import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { UserInterestProfile, UserInterestProfileDocument } from './schemas/user-interest-profile.schema';
import { RecommendationEvent } from './schemas/recommendation-event.schema';
import { Ad, AdDocument } from '../ads/schemas/category-schemas/ad.schema';
import { RedisService } from '../common/services/redis.service';
import { ProfileBlenderService } from './profile-blender.service';

@Injectable()
export class InterestBuilderService {
  private readonly logger = new Logger(InterestBuilderService.name);

  // Separate weights for Short-Term (reacts fast) and Long-Term (evolves slowly)
  private readonly WEIGHTS = {
    impression: { st: 1, lt: 0.1 },
    click: { st: 3, lt: 0.3 },
    wishlist: { st: 5, lt: 0.5 },
    add_to_cart: { st: 7, lt: 0.7 },
    purchase: { st: 10, lt: 1.0 },
    hide: { st: -8, lt: -0.8 },
    not_interested: { st: -15, lt: -1.5 },
  };

  constructor(
    @InjectModel(UserInterestProfile.name) private readonly profileModel: Model<UserInterestProfileDocument>,
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    private readonly redisService: RedisService,
    private readonly profileBlenderService: ProfileBlenderService,
  ) {}

  @OnEvent('analytics.events.recorded')
  async handleEvents(events: RecommendationEvent[]) {
    if (!events || events.length === 0) return;

    // Deduplicate product IDs to batch fetch metadata
    const productIds = [...new Set(events.map(e => e.productId).filter(Boolean))];
    let productMetadataMap: Record<string, { tags: string[], category: string, merchantId: string }> = {};

    if (productIds.length > 0) {
      try {
        const ads = await this.adModel.find({ _id: { $in: productIds } }).select('tags category userId').lean();
        ads.forEach(ad => {
          productMetadataMap[ad._id.toString()] = {
            tags: ad.tags || [],
            category: ad.category || '',
            merchantId: ad.userId || ''
          };
        });
      } catch (err) {
        this.logger.error(`Failed to fetch product metadata for interest builder: ${err.message}`);
      }
    }

    for (const event of events) {
      if (!event.userId) continue;
      
      const weights = this.WEIGHTS[event.eventType as keyof typeof this.WEIGHTS] || { st: 0, lt: 0 };
      if (weights.st === 0 && weights.lt === 0) continue;

      const metadata = productMetadataMap[event.productId] || null;
      if (!metadata) continue; // Skip if product not found

      const $inc: Record<string, number> = {};
      
      $inc['interactionCount'] = 1;

      // Increment tags
      metadata.tags.forEach(tag => {
        $inc[`shortTerm.tags.${tag}`] = weights.st;
        $inc[`longTerm.tags.${tag}`] = weights.lt;
      });

      // Increment category
      if (metadata.category) {
        $inc[`shortTerm.categories.${metadata.category}`] = weights.st;
        $inc[`longTerm.categories.${metadata.category}`] = weights.lt;
      }

      // Increment merchant
      if (metadata.merchantId) {
        $inc[`shortTerm.merchants.${metadata.merchantId}`] = weights.st;
        $inc[`longTerm.merchants.${metadata.merchantId}`] = weights.lt;
      }

      if (Object.keys($inc).length > 0) {
        try {
          const profile = await this.profileModel.findOneAndUpdate(
            { userId: event.userId },
            { $inc, $set: { updatedAt: new Date() } },
            { upsert: true, new: true }
          );

          // Compute smart confidence dynamically
          if (profile) {
            const uniqueCategories = Object.keys(profile.longTerm?.categories || {}).length;
            const uniqueMerchants = Object.keys(profile.longTerm?.merchants || {}).length;
            const interactionCount = profile.interactionCount || 0;
            
            // Normalized out of hypothetical maxes to bound between 0-1
            const score = (
              Math.min(interactionCount / 50, 0.4) + 
              Math.min(uniqueCategories / 10, 0.3) + 
              Math.min(uniqueMerchants / 10, 0.3)
            );

            profile.confidence = Math.round(score * 100) / 100;
            await profile.save();

            // Background blend and cache
            if (this.redisService.isEnabled()) {
              await this.profileBlenderService.blendAndCache(event.userId);
            }
          }

        } catch (error) {
          this.logger.error(`Failed to update interest profile for user ${event.userId}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Weekly Cron to decay short-term by 10% and long-term by 0.5%.
   */
  @Cron('0 0 * * 0') // Every Sunday at midnight
  async decayInterests() {
    this.logger.log('Starting weekly dual-vector interest decay job...');
    try {
      const cursor = this.profileModel.find().cursor();
      
      for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        let changed = false;
        
        // Decay Short Term (0.90)
        ['tags', 'categories', 'merchants'].forEach(field => {
          for (const [key, score] of Object.entries(doc.shortTerm?.[field] || {})) {
            doc.shortTerm[field][key] = Math.round((score as number) * 0.90 * 100) / 100;
            changed = true;
          }
        });

        // Decay Long Term (0.995)
        ['tags', 'categories', 'merchants'].forEach(field => {
          for (const [key, score] of Object.entries(doc.longTerm?.[field] || {})) {
            doc.longTerm[field][key] = Math.round((score as number) * 0.995 * 1000) / 1000;
            changed = true;
          }
        });

        if (changed) {
          doc.markModified('shortTerm');
          doc.markModified('longTerm');
          await doc.save();
        }
      }
      this.logger.log('Completed weekly dual-vector interest decay job.');
    } catch (error) {
      this.logger.error(`Failed to execute interest decay job: ${error.message}`);
    }
  }
}

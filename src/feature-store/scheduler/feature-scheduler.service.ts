import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { ProductFeature, ProductFeatureDocument } from '../product/product-feature.schema';
import { Ad, AdDocument } from '../../ads/schemas/category-schemas/ad.schema';
import { RecommendationEvent, RecommendationEventDocument } from '../../analytics/schemas/recommendation-event.schema';

@Injectable()
export class FeatureSchedulerService {
  private readonly logger = new Logger(FeatureSchedulerService.name);

  constructor(
    @InjectModel(ProductFeature.name) private readonly featureModel: Model<ProductFeatureDocument>,
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(RecommendationEvent.name) private readonly eventModel: Model<RecommendationEventDocument>,
  ) {}

  @Cron('0 * * * *') // Every hour
  async computeProductFeatures() {
    this.logger.log('Starting hourly product feature store computation...');
    try {
      // 1. Aggregate events by productId
      const eventStats = await this.eventModel.aggregate([
        { $match: { productId: { $exists: true, $ne: null } } },
        { 
          $group: {
            _id: '$productId',
            views: { $sum: { $cond: [{ $eq: ['$eventType', 'view'] }, 1, 0] } },
            clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] } },
            carts: { $sum: { $cond: [{ $eq: ['$eventType', 'add_to_cart'] }, 1, 0] } },
            wishlists: { $sum: { $cond: [{ $eq: ['$eventType', 'wishlist'] }, 1, 0] } },
            purchases: { $sum: { $cond: [{ $eq: ['$eventType', 'purchase'] }, 1, 0] } }
          }
        }
      ]);

      const statsMap = new Map();
      for (const stat of eventStats) {
        statsMap.set(stat._id.toString(), stat);
      }

      const cursor = this.adModel.find({ status: 'active' }).cursor();
      const now = new Date();
      let count = 0;

      for (let ad = await cursor.next(); ad != null; ad = await cursor.next()) {
        const adIdStr = ad._id.toString();
        const stats = statsMap.get(adIdStr) || { views: 0, clicks: 0, carts: 0, wishlists: 0, purchases: 0 };
        
        // Merge ad views with event views for a complete picture
        const totalViews = Math.max(ad.views || 0, stats.views);
        const totalClicks = Math.max(ad.contactClicks || 0, stats.clicks);

        // Popularity: normalized assuming 1000 views is max score 1.0
        const popularityScore = Math.min(totalViews / 1000, 1.0);
        
        // Freshness: exponential decay based on days since creation
        const daysOld = (now.getTime() - new Date(ad.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const freshnessScore = Math.max(0, 1.0 * Math.exp(-0.05 * daysOld));
        
        // Rates
        const ctr = totalViews > 0 ? totalClicks / totalViews : 0;
        const wishlistRate = totalViews > 0 ? stats.wishlists / totalViews : 0;
        const cartRate = totalViews > 0 ? stats.carts / totalViews : 0;
        const conversionRate = totalViews > 0 ? stats.purchases / totalViews : 0;

        // Stubbed values that would be fetched from other services in a real environment
        const inventoryScore = 1.0; // Assume always in stock for MVP unless synced with inventory service
        const priceCompetitiveness = 0.5; // Average
        const returnRate = 0.01; // 1%
        const discountQuality = ad['discount']?.isActive ? 0.8 : 0;
        const merchantResponseTime = 3600; // 1 hour in seconds
        const merchantFulfillmentRate = 0.95; // 95%

        await this.featureModel.updateOne(
          { productId: adIdStr },
          {
            $set: {
              popularityScore: Math.round(popularityScore * 100) / 100,
              freshnessScore: Math.round(freshnessScore * 100) / 100,
              ctr: Math.round(ctr * 1000) / 1000,
              wishlistRate: Math.round(wishlistRate * 1000) / 1000,
              cartRate: Math.round(cartRate * 1000) / 1000,
              conversionRate: Math.round(conversionRate * 1000) / 1000,
              inventoryScore,
              priceCompetitiveness,
              returnRate,
              discountQuality,
              merchantResponseTime,
              merchantFulfillmentRate,
              updatedAt: now
            }
          },
          { upsert: true }
        );
        count++;
      }
      this.logger.log(`Computed product features for ${count} active products.`);
    } catch (error) {
      this.logger.error(`Feature computation failed: ${error.message}`);
    }
  }
}

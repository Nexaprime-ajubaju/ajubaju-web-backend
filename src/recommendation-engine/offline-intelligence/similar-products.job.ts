import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OfflineJob } from './offline-job.interface';
import { Ad, AdDocument } from '../../ads/schemas/category-schemas/ad.schema';
import { SimilarProduct, SimilarProductDocument } from './schemas/similar-product.schema';

@Injectable()
export class SimilarProductsJob implements OfflineJob {
  private readonly logger = new Logger(SimilarProductsJob.name);
  readonly key = 'similar_products';
  readonly schedule = '0 3 * * *'; // 3 AM daily

  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(SimilarProduct.name) private readonly similarProductModel: Model<SimilarProductDocument>
  ) {}

  async execute(): Promise<void> {
    this.logger.log('Starting SimilarProductsJob');
    const startTime = Date.now();
    let computedCount = 0;

    try {
      // 1. Fetch active products
      // In production, you'd process in chunks. For MVP, we'll fetch all active.
      const activeAds = await this.adModel.find({ status: 'active' })
        .select('_id title category subCategory tags price userId')
        .lean();

      this.logger.log(`Found ${activeAds.length} active ads for similarity calculation`);

      // 2. Clear old similarities (for MVP we recompute entirely)
      await this.similarProductModel.deleteMany({});

      const batch = [];
      
      // 3. Compute O(N^2) similarity for MVP (Can be optimized to use search indices or vector embeddings later)
      for (let i = 0; i < activeAds.length; i++) {
        const source = activeAds[i];
        const similarities = [];

        for (let j = 0; j < activeAds.length; j++) {
          if (i === j) continue;
          
          const target = activeAds[j];
          let score = 0;
          let matchedCategory = false;
          let matchedMerchant = false;
          let matchedPriceRange = false;
          const matchedTags: string[] = [];

          // Category match is highly weighted
          if (source.category === target.category) {
            score += 0.4;
            matchedCategory = true;
            if (source.subCategory === target.subCategory) {
              score += 0.2;
            }
          }

          // Same merchant gets slight boost (brand affinity)
          if (source.userId === target.userId) {
            score += 0.1;
            matchedMerchant = true;
          }

          // Price range (within 30%)
          if (source.price && target.price) {
            const ratio = source.price / target.price;
            if (ratio >= 0.7 && ratio <= 1.3) {
              score += 0.1;
              matchedPriceRange = true;
            }
          }

          // Tag overlap
          if (source.tags && target.tags) {
            for (const tag of source.tags) {
              if (target.tags.includes(tag)) {
                matchedTags.push(tag);
                score += 0.1; 
              }
            }
          }

          if (score >= 0.3) {
            similarities.push({
              productId: new Types.ObjectId(source._id),
              similarProductId: new Types.ObjectId(target._id),
              similarityScore: Math.min(score, 1.0),
              matchedCategory,
              matchedMerchant,
              matchedPriceRange,
              matchedTags,
              algorithmVersion: 'v1.0.0'
            });
          }
        }

        // Keep top 15 most similar products
        similarities.sort((a, b) => b.similarityScore - a.similarityScore);
        batch.push(...similarities.slice(0, 15));

        // Insert in batches of 1000 to save memory
        if (batch.length >= 1000) {
          await this.similarProductModel.insertMany(batch);
          computedCount += batch.length;
          batch.length = 0;
        }
      }

      if (batch.length > 0) {
        await this.similarProductModel.insertMany(batch);
        computedCount += batch.length;
      }

      const duration = (Date.now() - startTime) / 1000;
      this.logger.log(`Completed SimilarProductsJob. Generated ${computedCount} links in ${duration}s.`);
    } catch (error) {
      this.logger.error(`SimilarProductsJob failed: ${error.message}`, error.stack);
    }
  }
}

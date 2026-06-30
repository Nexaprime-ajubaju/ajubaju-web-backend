import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Ad, AdDocument } from '../../ads/schemas/category-schemas/ad.schema';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { ConfigService } from '@nestjs/config';

export interface RetrieverOptions {
  minCandidates?: number;
  maxCandidates?: number;
  radii?: number[]; // In km (e.g. [5, 10, 20])
}

@Injectable()
export class CandidateRetrieverService {
  private readonly logger = new Logger(CandidateRetrieverService.name);
  
  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  private get baseSelect() {
    return 'title description price category tags locationCoordinates views contactClicks userId imageUrl images status autoDisabled';
  }

  async findByProductIds(ids: string[], limit: number = 20): Promise<any[]> {
    return this.adModel.find({ _id: { $in: ids }, status: 'active' })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findByMerchantIds(merchantIds: string[], limit: number = 20): Promise<any[]> {
    return this.adModel.find({ userId: { $in: merchantIds }, status: 'active' })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findByTags(tags: string[], limit: number = 20): Promise<any[]> {
    return this.adModel.find({ tags: { $in: tags }, status: 'active' })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findByCategories(categories: string[], limit: number = 20): Promise<any[]> {
    return this.adModel.find({ category: { $in: categories }, status: 'active' })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findNearby(coordinates: { latitude: number, longitude: number }, maxDistanceKm: number = 20, limit: number = 20): Promise<any[]> {
    if (!coordinates) return [];
    
    return this.adModel.find({
      status: 'active',
      locationCoordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude]
          },
          $maxDistance: maxDistanceKm * 1000
        }
      }
    })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findRecentProducts(days: number = 14, limit: number = 20): Promise<any[]> {
    const date = new Date();
    date.setDate(date.getDate() - days);
    
    return this.adModel.find({
      status: 'active',
      createdAt: { $gte: date }
    })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findDiscounted(limit: number = 20): Promise<any[]> {
    // Assuming discount is derived or there's a field for flash deals.
    // For now we'll query items that have an active discount/offer flag.
    return this.adModel.find({
      status: 'active',
      'discount.isActive': true // Placeholder: adjust based on schema
    })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findSponsored(limit: number = 20): Promise<any[]> {
    // Fallback logic for sponsored items
    return this.adModel.find({
      status: 'active',
      isSponsored: true
    })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findOfflineCollection(collectionName: string, filter: any = {}, limit: number = 20): Promise<any[]> {
    try {
      const collection = this.connection.collection(collectionName);
      if (!collection) return [];
      
      const records = await collection.find(filter).limit(limit).toArray();
      if (records.length === 0) return [];
      
      // We assume offline collections store product IDs, so we fetch the products
      let productIds = [];
      records.forEach(r => {
        if (r.recommendedProductIds && Array.isArray(r.recommendedProductIds)) {
          productIds.push(...r.recommendedProductIds);
        } else if (r.productId) {
          productIds.push(r.productId);
        } else if (r._id) {
          productIds.push(r._id);
        }
      });
      
      // De-duplicate
      productIds = [...new Set(productIds.map(id => id.toString()))].filter(Boolean);
      
      return this.findByProductIds(productIds, limit);
    } catch (err) {
      this.logger.error(`Failed to query offline collection ${collectionName}: ${err.message}`);
      return [];
    }
  }

  /**
   * Legacy method for interest expansion.
   */
  async findCandidates(
    categories: string[],
    tags: string[],
    context: RecommendationContext,
    options: RetrieverOptions = {}
  ): Promise<any[]> {
    const minCandidates = options.minCandidates || 30;
    const maxCandidates = options.maxCandidates || 100;
    
    let defaultRadii = [5, 10, 20];
    const envRadiiStr = this.configService.get<string>('RADIUS_EXPANSION');
    if (envRadiiStr) {
      defaultRadii = envRadiiStr.split(',').map(r => parseInt(r.trim(), 10)).filter(r => !isNaN(r));
    }
    const radii = options.radii || defaultRadii; // Default expansion

    const baseQuery: any = { status: 'active' };
    
    // Match categories OR tags
    if (categories.length > 0 || tags.length > 0) {
      baseQuery.$or = [];
      if (categories.length > 0) baseQuery.$or.push({ category: { $in: categories } });
      if (tags.length > 0) baseQuery.$or.push({ tags: { $in: tags } });
    }

    // Without location, just fetch limit
    if (!context.coordinates) {
      return this.adModel.find(baseQuery)
        .limit(maxCandidates)
        .select(this.baseSelect)
        .lean();
    }

    let allCandidates = [];

    // Attempt radius expansion
    for (const radius of radii) {
      const query = { ...baseQuery };
      query.locationCoordinates = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [context.coordinates.longitude, context.coordinates.latitude]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      };

      const candidates = await this.adModel.find(query)
        .limit(maxCandidates)
        .select(this.baseSelect)
        .lean();
      
      this.logger.debug(`Retriever found ${candidates.length} candidates at ${radius}km`);
      
      if (candidates.length >= minCandidates) {
        return candidates;
      }
      
      allCandidates = candidates;
    }

    // If we exhaust radii and still don't have minCandidates, return what we found
    this.logger.debug(`Retriever exhausted radii, returning ${allCandidates.length} candidates`);
    return allCandidates;
  }
}

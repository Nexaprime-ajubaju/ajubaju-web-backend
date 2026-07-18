import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Model, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { OfferPromotion, OfferPromotionDocument } from '../../offers/schemas/offer-promotion.schema';
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
    @InjectModel(OfferPromotion.name) private readonly offerModel: Model<OfferPromotionDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  private get baseSelect() {
    return 'title description category businessCategory businessSubCategory promoTag imageUrl selectedProducts status views viewHistory createdAt startDate endDate merchantId merchantName merchantEmail';
  }

  async findByProductIds(
    ids: string[],
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    const objectIds = ids
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    const offers = await this.offerModel
      .find({ _id: { $in: objectIds }, status: { $in: ['approved', 'active'] } })
      .limit(limit)
      .select(this.baseSelect)
      .lean();

    const merchantIds = [...new Set(offers.map((o) => o.merchantId).filter(Boolean))];
    const merchantMap = new Map();
    let validMerchantIds = new Set<string>();

    if (merchantIds.length > 0) {
      const merchantQuery: any = { userId: { $in: merchantIds } };

      if (coordinates) {
        const latDegreeKm = 111;
        const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);
        const latOffset = maxDistanceKm / latDegreeKm;
        const lonOffset = maxDistanceKm / lonDegreeKm;

        merchantQuery.storeLocationLatitude = {
          $gte: coordinates.latitude - latOffset,
          $lte: coordinates.latitude + latOffset,
        };
        merchantQuery.storeLocationLongitude = {
          $gte: coordinates.longitude - lonOffset,
          $lte: coordinates.longitude + lonOffset,
        };
      }

      const merchants = await this.connection
        .collection('merchants')
        .find(
          merchantQuery,
          { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
        )
        .toArray();

      merchants.forEach((m) => {
        merchantMap.set(m.userId, m);
        validMerchantIds.add(m.userId);
      });
    }

    // Filter offers by merchants that matched the geographic bounding box
    const filteredOffers = coordinates 
      ? offers.filter((offer) => validMerchantIds.has(offer.merchantId))
      : offers;

    return filteredOffers.map((offer) => {
      const merchant = merchantMap.get(offer.merchantId);
      if (merchant && merchant.storeLocationLatitude && merchant.storeLocationLongitude) {
        return {
          ...offer,
          locationCoordinates: {
            type: 'Point',
            coordinates: [merchant.storeLocationLongitude, merchant.storeLocationLatitude],
          },
        };
      }
      return offer;
    });
  }

  async findByMerchantIds(
    merchantIds: string[],
    limit: number = 20,
  ): Promise<any[]> {
    return this.offerModel
      .find({ merchantId: { $in: merchantIds }, status: { $in: ['approved', 'active'] } })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }
  async findByTags(tags: string[], limit: number = 20): Promise<any[]> {
    return this.offerModel
      .find({
        $or: [{ category: { $in: tags } }, { businessCategory: { $in: tags } }],
        status: { $in: ['approved', 'active'] }
      })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findByCategories(
    categories: string[],
    limit: number = 20,
  ): Promise<any[]> {
    return this.offerModel
      .find({ category: { $in: categories }, status: { $in: ['approved', 'active'] } })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findNearby(
    coordinates: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
    limit: number = 20,
  ): Promise<any[]> {
    if (!coordinates) return [];

    const latDegreeKm = 111;
    const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);

    const latOffset = maxDistanceKm / latDegreeKm;
    const lonOffset = maxDistanceKm / lonDegreeKm;

    const minLat = coordinates.latitude - latOffset;
    const maxLat = coordinates.latitude + latOffset;
    const minLon = coordinates.longitude - lonOffset;
    const maxLon = coordinates.longitude + lonOffset;

    const merchants = await this.connection
      .collection('merchants')
      .find(
        {
          storeLocationLatitude: { $gte: minLat, $lte: maxLat },
          storeLocationLongitude: { $gte: minLon, $lte: maxLon },
        },
        { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
      )
      .toArray();

    if (merchants.length === 0) return [];

    const merchantIds = merchants.map((m) => m.userId);
    const merchantMap = new Map();
    merchants.forEach((m) => merchantMap.set(m.userId, m));

    const offers = await this.offerModel
      .find({
        merchantId: { $in: merchantIds },
        status: { $in: ['approved', 'active'] },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(this.baseSelect)
      .lean();

    return offers.map((offer) => {
      const merchant = merchantMap.get(offer.merchantId);
      if (merchant && merchant.storeLocationLatitude && merchant.storeLocationLongitude) {
        return {
          ...offer,
          locationCoordinates: {
            type: 'Point',
            coordinates: [merchant.storeLocationLongitude, merchant.storeLocationLatitude],
          },
        };
      }
      return offer;
    });
  }

  async findRecentProducts(
    days: number = 14,
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    
    let merchantIdsFilter = null;
    let merchantMap = new Map();

    if (coordinates) {
      const latDegreeKm = 111;
      const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);

      const latOffset = maxDistanceKm / latDegreeKm;
      const lonOffset = maxDistanceKm / lonDegreeKm;

      const minLat = coordinates.latitude - latOffset;
      const maxLat = coordinates.latitude + latOffset;
      const minLon = coordinates.longitude - lonOffset;
      const maxLon = coordinates.longitude + lonOffset;

      const merchants = await this.connection
        .collection('merchants')
        .find(
          {
            storeLocationLatitude: { $gte: minLat, $lte: maxLat },
            storeLocationLongitude: { $gte: minLon, $lte: maxLon },
          },
          { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
        )
        .toArray();

      if (merchants.length === 0) return [];
      
      merchantIdsFilter = merchants.map((m) => m.userId);
      merchants.forEach((m) => merchantMap.set(m.userId, m));
    }

    const query: any = {
      status: { $in: ['approved', 'active'] },
      createdAt: { $gte: dateLimit },
    };
    if (merchantIdsFilter) {
      query.merchantId = { $in: merchantIdsFilter };
    }

    const offers = await this.offerModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(this.baseSelect)
      .lean();

    if (!coordinates) {
      const merchantIds = [...new Set(offers.map((o) => o.merchantId).filter(Boolean))];
      if (merchantIds.length > 0) {
        const merchants = await this.connection
          .collection('merchants')
          .find(
            { userId: { $in: merchantIds } },
            { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
          )
          .toArray();
        merchants.forEach((m) => merchantMap.set(m.userId, m));
      }
    }

    return offers.map((offer) => {
      const merchant = merchantMap.get(offer.merchantId);
      if (merchant && merchant.storeLocationLatitude && merchant.storeLocationLongitude) {
        return {
          ...offer,
          locationCoordinates: {
            type: 'Point',
            coordinates: [merchant.storeLocationLongitude, merchant.storeLocationLatitude],
          },
        };
      }
      return offer;
    });
  }

  async findPopularProducts(
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    let merchantIdsFilter = null;
    let merchantMap = new Map();

    if (coordinates) {
      const latDegreeKm = 111;
      const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);

      const latOffset = maxDistanceKm / latDegreeKm;
      const lonOffset = maxDistanceKm / lonDegreeKm;

      const minLat = coordinates.latitude - latOffset;
      const maxLat = coordinates.latitude + latOffset;
      const minLon = coordinates.longitude - lonOffset;
      const maxLon = coordinates.longitude + lonOffset;

      const merchants = await this.connection
        .collection('merchants')
        .find(
          {
            storeLocationLatitude: { $gte: minLat, $lte: maxLat },
            storeLocationLongitude: { $gte: minLon, $lte: maxLon },
          },
          { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
        )
        .toArray();

      if (merchants.length === 0) return [];
      
      merchantIdsFilter = merchants.map((m) => m.userId);
      merchants.forEach((m) => merchantMap.set(m.userId, m));
    }

    const query: any = { status: { $in: ['approved', 'active'] } };
    if (merchantIdsFilter) {
      query.merchantId = { $in: merchantIdsFilter };
    }

    const offers = await this.offerModel
      .find(query)
      .sort({ views: -1 })
      .limit(limit)
      .select(this.baseSelect)
      .lean();

    // If coordinates weren't provided in the request, we still need to fetch merchants
    // to attach locationCoordinates so DistanceComponent can work globally.
    if (!coordinates) {
      const merchantIds = [...new Set(offers.map((o) => o.merchantId).filter(Boolean))];
      if (merchantIds.length > 0) {
        const merchants = await this.connection
          .collection('merchants')
          .find(
            { userId: { $in: merchantIds } },
            { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
          )
          .toArray();
        merchants.forEach((m) => merchantMap.set(m.userId, m));
      }
    }

    return offers.map((offer) => {
      const merchant = merchantMap.get(offer.merchantId);
      if (merchant && merchant.storeLocationLatitude && merchant.storeLocationLongitude) {
        return {
          ...offer,
          locationCoordinates: {
            type: 'Point',
            coordinates: [merchant.storeLocationLongitude, merchant.storeLocationLatitude],
          },
        };
      }
      return offer;
    });
  }

  async findDiscounted(
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    let merchantIdsFilter = null;
    let merchantMap = new Map();

    if (coordinates) {
      const latDegreeKm = 111;
      const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);

      const latOffset = maxDistanceKm / latDegreeKm;
      const lonOffset = maxDistanceKm / lonDegreeKm;

      const minLat = coordinates.latitude - latOffset;
      const maxLat = coordinates.latitude + latOffset;
      const minLon = coordinates.longitude - lonOffset;
      const maxLon = coordinates.longitude + lonOffset;

      const merchants = await this.connection
        .collection('merchants')
        .find(
          {
            storeLocationLatitude: { $gte: minLat, $lte: maxLat },
            storeLocationLongitude: { $gte: minLon, $lte: maxLon },
          },
          { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
        )
        .toArray();

      if (merchants.length === 0) return [];
      
      merchantIdsFilter = merchants.map((m) => m.userId);
      merchants.forEach((m) => merchantMap.set(m.userId, m));
    }

    const matchStage: any = {
      status: { $in: ['approved', 'active'] },
    };
    if (merchantIdsFilter) {
      matchStage.merchantId = { $in: merchantIdsFilter };
    }

    const projection: any = { _id: 1 };
    if (this.baseSelect) {
      this.baseSelect.split(' ').forEach((field) => {
        if (field.trim()) {
          if (field.startsWith('-')) {
             projection[field.substring(1)] = 0;
          } else {
             projection[field] = 1;
          }
        }
      });
    }

    const offers = await this.offerModel.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          maxDiscountPct: {
            $max: {
              $map: {
                input: { $ifNull: ['$selectedProducts', []] },
                as: 'product',
                in: {
                  $cond: [
                    { $gt: ['$$product.originalPrice', 0] },
                    {
                      $multiply: [
                        {
                          $divide: [
                            { $subtract: ['$$product.originalPrice', '$$product.offerPrice'] },
                            '$$product.originalPrice'
                          ]
                        },
                        100
                      ]
                    },
                    0
                  ]
                }
              }
            }
          }
        }
      },
      { $sort: { maxDiscountPct: -1 } },
      { $limit: limit },
      { $project: projection }
    ]);

    if (!coordinates) {
      const merchantIds = [...new Set(offers.map((o) => o.merchantId).filter(Boolean))];
      if (merchantIds.length > 0) {
        const merchants = await this.connection
          .collection('merchants')
          .find(
            { userId: { $in: merchantIds } },
            { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
          )
          .toArray();
        merchants.forEach((m) => merchantMap.set(m.userId, m));
      }
    }

    return offers.map((offer) => {
      const merchant = merchantMap.get(offer.merchantId);
      if (merchant && merchant.storeLocationLatitude && merchant.storeLocationLongitude) {
        return {
          ...offer,
          locationCoordinates: {
            type: 'Point',
            coordinates: [merchant.storeLocationLongitude, merchant.storeLocationLatitude],
          },
        };
      }
      return offer;
    });
  }

  async findSponsored(limit: number = 20): Promise<any[]> {
    return this.offerModel
      .find({
        status: { $in: ['approved', 'active'] },
        isActive: true,
      })
      .limit(limit)
      .select(this.baseSelect)
      .lean();
  }

  async findOfflineCollection(
    collectionName: string,
    filter: any = {},
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    try {
      const collection = this.connection.collection(collectionName);
      if (!collection) return [];

      const records = await collection.find(filter).limit(limit * 2).toArray(); // Fetch more since we might filter out
      if (records.length === 0) return [];

      // We assume offline collections store product IDs, so we fetch the products
      let productIds = [];
      records.forEach((r) => {
        if (r.recommendedProductIds && Array.isArray(r.recommendedProductIds)) {
          productIds.push(...r.recommendedProductIds);
        } else if (r.productId) {
          productIds.push(r.productId);
        } else if (r._id) {
          productIds.push(r._id);
        }
      });

      // De-duplicate
      productIds = [...new Set(productIds.map((id) => id.toString()))].filter(
        Boolean,
      );

      return this.findByProductIds(productIds, limit, coordinates, maxDistanceKm);
    } catch (err) {
      this.logger.error(
        `Failed to query offline collection ${collectionName}: ${err.message}`,
      );
      return [];
    }
  }

  async findBestSellingMerchants(
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    try {
      const collection = this.connection.collection('best_sellers');
      if (!collection) return [];

      const records = await collection.find({}).limit(limit * 2).toArray();
      if (records.length === 0) return [];

      let productIds = records.map((r) => r.productId).filter(Boolean);
      productIds = [...new Set(productIds.map((id) => id.toString()))].filter(Boolean);

      const objectIds = productIds.map((id) => {
        try { return new mongoose.Types.ObjectId(id); } catch (e) { return null; }
      }).filter(Boolean);

      const offers = await this.offerModel.find({ _id: { $in: objectIds }, status: { $in: ['approved', 'active'] } }).lean();
      
      let merchantIds = [...new Set(offers.map((o) => o.merchantId).filter(Boolean))];
      
      if (merchantIds.length === 0) return [];

      let merchantFilter: any = { userId: { $in: merchantIds } };

      if (coordinates) {
        const latDegreeKm = 111;
        const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);
        const latOffset = maxDistanceKm / latDegreeKm;
        const lonOffset = maxDistanceKm / lonDegreeKm;
        
        merchantFilter.storeLocationLatitude = {
          $gte: coordinates.latitude - latOffset,
          $lte: coordinates.latitude + latOffset,
        };
        merchantFilter.storeLocationLongitude = {
          $gte: coordinates.longitude - lonOffset,
          $lte: coordinates.longitude + lonOffset,
        };
      }

      const merchants = await this.connection
        .collection('merchants')
        .find(merchantFilter)
        .limit(limit)
        .toArray();

      return merchants.map(m => ({
        ...m,
        type: 'merchant',
        locationCoordinates: {
          type: 'Point',
          coordinates: [m.storeLocationLongitude, m.storeLocationLatitude],
        }
      }));
    } catch (err) {
      this.logger.error(`Failed to find best selling merchants: ${err.message}`);
      return [];
    }
  }

  async findPopularMerchants(
    limit: number = 20,
    coordinates?: { latitude: number; longitude: number },
    maxDistanceKm: number = 20,
  ): Promise<any[]> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const matchStage: any = { 
        status: { $in: ['approved', 'active'] },
        createdAt: { $gte: sevenDaysAgo }
      };

      if (coordinates) {
        const latDegreeKm = 111;
        const lonDegreeKm = 111 * Math.cos((coordinates.latitude * Math.PI) / 180);
        const latOffset = maxDistanceKm / latDegreeKm;
        const lonOffset = maxDistanceKm / lonDegreeKm;
        
        const localMerchants = await this.connection
          .collection('merchants')
          .find({
            storeLocationLatitude: {
              $gte: coordinates.latitude - latOffset,
              $lte: coordinates.latitude + latOffset,
            },
            storeLocationLongitude: {
              $gte: coordinates.longitude - lonOffset,
              $lte: coordinates.longitude + lonOffset,
            }
          }, { projection: { userId: 1 } })
          .toArray();
          
        if (localMerchants.length === 0) return [];
        matchStage.merchantId = { $in: localMerchants.map(m => m.userId) };
      }

      const topOffers = await this.offerModel.aggregate([
        { $match: matchStage },
        { $sort: { views: -1 } },
        { $group: { _id: '$merchantId', totalViews: { $sum: '$views' } } },
        { $sort: { totalViews: -1 } },
        { $limit: limit }
      ]);

      if (topOffers.length === 0) return [];

      const merchantIds = topOffers.map(o => o._id).filter(Boolean);

      const merchants = await this.connection
        .collection('merchants')
        .find({ userId: { $in: merchantIds } })
        .toArray();

      // Sort merchants to match the topOffers order
      const merchantMap = new Map(merchants.map(m => [m.userId, m]));
      const sortedMerchants = merchantIds.map(id => merchantMap.get(id)).filter(Boolean);

      return sortedMerchants.map((m: any) => ({
        ...m,
        type: 'merchant',
        locationCoordinates: {
          type: 'Point',
          coordinates: [m.storeLocationLongitude, m.storeLocationLatitude],
        }
      }));

    } catch (err) {
      this.logger.error(`Failed to find popular merchants: ${err.message}`);
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
    options: RetrieverOptions = {},
  ): Promise<any[]> {
    const maxCandidates = options.maxCandidates || 100;
    const baseQuery: any = { status: { $in: ['approved', 'active'] } };

    // Match categories OR tags
    if (categories.length > 0 || tags.length > 0) {
      baseQuery.$or = [];
      if (categories.length > 0)
        baseQuery.$or.push({ category: { $in: categories } });
      if (tags.length > 0) baseQuery.$or.push({ businessCategory: { $in: tags } });
    }

    let merchantIdsFilter = null;
    let merchantMap = new Map();

    if (context.latitude && context.longitude) {
      // Use the largest radius for the bounding box since progressive search
      // requires multiple DB queries which is expensive without an index.
      // We'll fetch all merchants within the max radius (e.g. 20km) and let 
      // the ranking engine's DistanceComponent score them perfectly anyway.
      let defaultRadii = [5, 10, 20];
      const envRadiiStr = this.configService.get<string>('RADIUS_EXPANSION');
      if (envRadiiStr) {
        defaultRadii = envRadiiStr
          .split(',')
          .map((r) => parseInt(r.trim(), 10))
          .filter((r) => !isNaN(r));
      }
      const radii = options.radii || defaultRadii;
      const maxDistanceKm = Math.max(...radii);

      const latDegreeKm = 111;
      const lonDegreeKm = 111 * Math.cos((context.latitude * Math.PI) / 180);

      const latOffset = maxDistanceKm / latDegreeKm;
      const lonOffset = maxDistanceKm / lonDegreeKm;

      const minLat = context.latitude - latOffset;
      const maxLat = context.latitude + latOffset;
      const minLon = context.longitude - lonOffset;
      const maxLon = context.longitude + lonOffset;

      const merchants = await this.connection
        .collection('merchants')
        .find(
          {
            storeLocationLatitude: { $gte: minLat, $lte: maxLat },
            storeLocationLongitude: { $gte: minLon, $lte: maxLon },
          },
          { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
        )
        .toArray();

      if (merchants.length === 0) return [];
      
      merchantIdsFilter = merchants.map((m) => m.userId);
      merchants.forEach((m) => merchantMap.set(m.userId, m));
    }

    if (merchantIdsFilter) {
      baseQuery.merchantId = { $in: merchantIdsFilter };
    }

    const offers = await this.offerModel
      .find(baseQuery)
      .limit(maxCandidates)
      .select(this.baseSelect)
      .lean();

    if (!context.latitude || !context.longitude) {
      const merchantIds = [...new Set(offers.map((o) => o.merchantId).filter(Boolean))];
      if (merchantIds.length > 0) {
        const merchants = await this.connection
          .collection('merchants')
          .find(
            { userId: { $in: merchantIds } },
            { projection: { userId: 1, storeLocationLatitude: 1, storeLocationLongitude: 1 } },
          )
          .toArray();
        merchants.forEach((m) => merchantMap.set(m.userId, m));
      }
    }

    return offers.map((offer) => {
      const merchant = merchantMap.get(offer.merchantId);
      if (merchant && merchant.storeLocationLatitude && merchant.storeLocationLongitude) {
        return {
          ...offer,
          locationCoordinates: {
            type: 'Point',
            coordinates: [merchant.storeLocationLongitude, merchant.storeLocationLatitude],
          },
        };
      }
      return offer;
    });
  }
}

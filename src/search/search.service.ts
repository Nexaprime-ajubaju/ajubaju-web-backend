import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { MerchantProduct, MerchantProductDocument } from '../merchant-products/schemas/merchant-product.schema';
import { OfferPromotion, OfferPromotionDocument } from '../offers/schemas/offer-promotion.schema';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel(Merchant.name) private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(MerchantProduct.name) private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(OfferPromotion.name) private readonly offerModel: Model<OfferPromotionDocument>,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async unifiedSearch(query: string, type: string, page: number, limit: number) {
    if (!query || !query.trim()) {
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
      };
    }

    const sanitized = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(sanitized, 'i');
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 16));
    const skip = (safePage - 1) * safeLimit;

    const cacheKey = `golo:search:unified:${sanitized.toLowerCase()}:${type}:${safePage}:${safeLimit}`;
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<any>(cacheKey);
        if (cached) return cached;
      } catch (e) {
        // Safe fallback
      }
    }

    try {
      const [merchants, products, offers, allMerchants] = await Promise.all([
        (type === 'all' || type === 'merchants')
          ? this.merchantModel.find({
              $or: [
                { storeName: { $regex: regex } },
                { name: { $regex: regex } },
                { category: { $regex: regex } },
                { storeCategory: { $regex: regex } },
                { storeSubCategory: { $regex: regex } },
                { storeLocation: { $regex: regex } },
              ],
            }).skip(type === 'all' ? 0 : skip).limit(safeLimit).maxTimeMS(5000).lean().exec()
          : Promise.resolve([]),
        (type === 'all' || type === 'products')
          ? this.merchantProductModel.find({
              $or: [
                { name: { $regex: regex } },
                { description: { $regex: regex } },
                { category: { $regex: regex } },
              ],
            }).skip(type === 'all' ? 0 : skip).limit(safeLimit).maxTimeMS(5000).lean().exec()
          : Promise.resolve([]),
        (type === 'all' || type === 'offers')
          ? this.offerModel.find({
              status: { $in: ['approved', 'active'] },
              $or: [
                { title: { $regex: regex } },
                { description: { $regex: regex } },
                { category: { $regex: regex } },
                { promoTag: { $regex: regex } },
                { 'selectedProducts.productName': { $regex: regex } },
              ],
            }).skip(type === 'all' ? 0 : skip).limit(safeLimit).maxTimeMS(5000).lean().exec()
          : Promise.resolve([]),
        this.merchantModel.find({})
          .select('userId storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto')
          .maxTimeMS(5000)
          .lean()
          .exec()
          .catch(() => []),
      ]);

      const merchantsMap = new Map();
      (allMerchants || []).forEach((m: any) => {
        if (m.userId) merchantsMap.set(m.userId.toString(), m);
        if (m._id) merchantsMap.set(m._id.toString(), m);
      });

      const mappedOffers = (offers || []).map((offer: any) => {
        const m = merchantsMap.get(String(offer.merchantId || ''));
        return {
          ...offer,
          offerId: offer._id?.toString() || offer.id,
          startsAt: offer.startDate,
          endsAt: offer.endDate,
          merchant: {
            merchantId: offer.merchantId,
            name: m?.storeName || offer.merchantName || 'Merchant',
            category: m?.storeCategory || offer.category || '',
            subCategory: m?.storeSubCategory || '',
            address: m?.storeLocation || '',
            latitude: m?.storeLocationLatitude || null,
            longitude: m?.storeLocationLongitude || null,
            profilePhoto: m?.profilePhoto || m?.shopPhoto || '',
          },
        };
      });

      const result = {
        success: true,
        data: {
          merchants: merchants || [],
          products: products || [],
          offers: mappedOffers,
        },
      };

      if (this.redisService) {
        try {
          await this.redisService.set(cacheKey, result, 120);
        } catch (e) {
          // Ignore cache write failure
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Unified search error: ${error?.message || error}`);
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
      };
    }
  }
}

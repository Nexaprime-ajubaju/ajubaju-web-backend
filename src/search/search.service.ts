import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
      return { success: true, data: { merchants: [], products: [], offers: [] } };
    }

    const rawQuery = query.trim();
    const escapedQuery = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexFallback = new RegExp(escapedQuery, 'i');
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 16));
    const skip = (safePage - 1) * safeLimit;

    const cacheKey = `golo:search:unified:${escapedQuery.toLowerCase()}:${type}:${safePage}:${safeLimit}`;
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<any>(cacheKey);
        if (cached) return cached;
      } catch (_e) { /* safe fallback */ }
    }

    // ── Helper: attempt $text search, fall back to regex if text index is missing ──
    const textOrRegex = (regexFields: Record<string, any>) => ({
      $or: [
        { $text: { $search: rawQuery } },
        ...Object.entries(regexFields).map(([field, _]) => ({ [field]: { $regex: regexFallback } })),
      ],
    });

    try {
      // Run the 3 collection searches in parallel — NO full merchant scan anymore.
      const [merchants, products, offers] = await Promise.all([
        (type === 'all' || type === 'merchants')
          ? this.merchantModel
              .find(textOrRegex({ storeName: 1, storeCategory: 1, storeSubCategory: 1, storeLocation: 1 }))
              .skip(type === 'all' ? 0 : skip)
              .limit(safeLimit)
              .maxTimeMS(5000)
              .lean()
              .exec()
              .catch(() =>
                // Pure regex fallback if $text index doesn't exist yet
                this.merchantModel.find({
                  $or: [
                    { storeName: { $regex: regexFallback } },
                    { storeCategory: { $regex: regexFallback } },
                    { storeLocation: { $regex: regexFallback } },
                  ],
                }).skip(type === 'all' ? 0 : skip).limit(safeLimit).maxTimeMS(5000).lean().exec()
              )
          : Promise.resolve([]),

        (type === 'all' || type === 'products')
          ? this.merchantProductModel
              .find(textOrRegex({ name: 1, description: 1, category: 1 }))
              .skip(type === 'all' ? 0 : skip)
              .limit(safeLimit)
              .maxTimeMS(5000)
              .lean()
              .exec()
              .catch(() =>
                this.merchantProductModel.find({
                  $or: [
                    { name: { $regex: regexFallback } },
                    { description: { $regex: regexFallback } },
                    { category: { $regex: regexFallback } },
                  ],
                }).skip(type === 'all' ? 0 : skip).limit(safeLimit).maxTimeMS(5000).lean().exec()
              )
          : Promise.resolve([]),

        (type === 'all' || type === 'offers')
          ? this.offerModel
              .find({
                status: { $in: ['approved', 'active'] },
                ...textOrRegex({ title: 1, description: 1, category: 1, businessCategory: 1, promoTag: 1 }),
              })
              .skip(type === 'all' ? 0 : skip)
              .limit(safeLimit)
              .maxTimeMS(5000)
              .lean()
              .exec()
              .catch(() =>
                this.offerModel.find({
                  status: { $in: ['approved', 'active'] },
                  $or: [
                    { title: { $regex: regexFallback } },
                    { category: { $regex: regexFallback } },
                    { businessCategory: { $regex: regexFallback } },
                  ],
                }).skip(type === 'all' ? 0 : skip).limit(safeLimit).maxTimeMS(5000).lean().exec()
              )
          : Promise.resolve([]),
      ]);

      // ── Targeted merchant join: only load merchants for the offers we got ────
      // Previously this did merchantModel.find({}) loading ALL merchants every search.
      const merchantIdsNeeded = [
        ...new Set(
          (offers || []).map((o: any) => String(o.merchantId || '')).filter(Boolean)
        ),
      ];

      const merchantsMap = new Map<string, any>();
      if (merchantIdsNeeded.length > 0) {
        try {
          const offerMerchants = await this.merchantModel
            .find({ $or: [{ userId: { $in: merchantIdsNeeded } }, { _id: { $in: merchantIdsNeeded } }] })
            .select('userId storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto')
            .maxTimeMS(3000)
            .lean()
            .exec();

          (offerMerchants || []).forEach((m: any) => {
            if (m.userId) merchantsMap.set(m.userId.toString(), m);
            if (m._id) merchantsMap.set(m._id.toString(), m);
          });
        } catch (e) {
          this.logger.warn('Search: merchant enrichment failed, offers will lack merchant detail');
        }
      }

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
            category: m?.storeCategory || offer.businessCategory || offer.category || '',
            subCategory: m?.storeSubCategory || offer.businessSubCategory || '',
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
        } catch (_e) { /* ignore */ }
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Unified search error: ${error?.message || error}`);
      return { success: true, data: { merchants: [], products: [], offers: [] } };
    }
  }
}

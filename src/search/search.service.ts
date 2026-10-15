import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import {
  MerchantProduct,
  MerchantProductDocument,
} from '../merchant-products/schemas/merchant-product.schema';
import {
  OfferPromotion,
  OfferPromotionDocument,
} from '../offers/schemas/offer-promotion.schema';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(OfferPromotion.name)
    private readonly offerModel: Model<OfferPromotionDocument>,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async unifiedSearch(
    query: string,
    type: string,
    page: number,
    limit: number,
  ) {
    if (!query || !query.trim()) {
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
      };
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
      } catch (_e) {
        /* safe fallback */
      }
    }

    // ── Helper: attempt $text search, fall back to regex if text index is missing ──
    const textOrRegex = (regexFields: Record<string, any>) => ({
      $or: [
        { $text: { $search: rawQuery } },
        ...Object.entries(regexFields).map(([field, _]) => ({
          [field]: { $regex: regexFallback },
        })),
      ],
    });

    try {
      // 1. Fetch matching products
      const productsPromise =
        type === 'all' || type === 'products'
          ? this.merchantProductModel
              .find({
                $or: [
                  { name: { $regex: regexFallback } },
                  { description: { $regex: regexFallback } },
                  { category: { $regex: regexFallback } },
                  { keywords: { $regex: regexFallback } },
                  { tags: { $regex: regexFallback } },
                ],
              })
              .skip(type === 'all' ? 0 : skip)
              .limit(safeLimit)
              .maxTimeMS(5000)
              .lean()
              .exec()
              .catch((err) => {
                this.logger.warn(`Product search error: ${err?.message}`);
                return [];
              })
          : Promise.resolve([]);

      // 2. Fetch matching offers
      const offersPromise =
        type === 'all' || type === 'offers'
          ? this.offerModel
              .find({
                status: { $in: ['approved', 'active'] },
                $or: [
                  { title: { $regex: regexFallback } },
                  { description: { $regex: regexFallback } },
                  { category: { $regex: regexFallback } },
                  { businessCategory: { $regex: regexFallback } },
                  { promoTag: { $regex: regexFallback } },
                ],
              })
              .skip(type === 'all' ? 0 : skip)
              .limit(safeLimit)
              .maxTimeMS(5000)
              .lean()
              .exec()
              .catch((err) => {
                this.logger.warn(`Offer search error: ${err?.message}`);
                return [];
              })
          : Promise.resolve([]);

      // Run products and offers first in parallel
      const [products, offers] = await Promise.all([
        productsPromise,
        offersPromise,
      ]);

      // 3. Fetch matching merchants (direct match + merchants selling matching products + merchants with matching offers)
      let merchants: any[] = [];
      if (type === 'all' || type === 'merchants') {
        let relatedMerchantIds: string[] = [];

        if (type === 'all') {
          relatedMerchantIds = [
            ...new Set([
              ...(products || [])
                .map((p: any) => String(p.merchantId || ''))
                .filter(Boolean),
              ...(offers || [])
                .map((o: any) => String(o.merchantId || ''))
                .filter(Boolean),
            ]),
          ];
        } else {
          // type === 'merchants': query distinct merchantIds from products & offers
          const [prodMids, offerMids] = await Promise.all([
            this.merchantProductModel
              .find({
                $or: [
                  { name: { $regex: regexFallback } },
                  { description: { $regex: regexFallback } },
                  { category: { $regex: regexFallback } },
                ],
              })
              .distinct('merchantId')
              .exec()
              .catch(() => []),
            this.offerModel
              .find({
                status: { $in: ['approved', 'active'] },
                $or: [
                  { title: { $regex: regexFallback } },
                  { description: { $regex: regexFallback } },
                  { category: { $regex: regexFallback } },
                ],
              })
              .distinct('merchantId')
              .exec()
              .catch(() => []),
          ]);
          relatedMerchantIds = [
            ...new Set([
              ...(prodMids || []).map(String).filter(Boolean),
              ...(offerMids || []).map(String).filter(Boolean),
            ]),
          ];
        }

        const validObjectIds = relatedMerchantIds
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));

        const directFilter = [
          { storeName: { $regex: regexFallback } },
          { storeCategory: { $regex: regexFallback } },
          { storeSubCategory: { $regex: regexFallback } },
          { storeLocation: { $regex: regexFallback } },
          { businessDescription: { $regex: regexFallback } },
          { keywords: { $regex: regexFallback } },
        ];

        const merchantOrClauses: any[] = [...directFilter];
        if (relatedMerchantIds.length > 0) {
          merchantOrClauses.push({ userId: { $in: relatedMerchantIds } });
          if (validObjectIds.length > 0) {
            merchantOrClauses.push({ _id: { $in: validObjectIds } });
          }
        }

        merchants = await this.merchantModel
          .find({ $or: merchantOrClauses })
          .skip(type === 'all' ? 0 : skip)
          .limit(safeLimit)
          .maxTimeMS(5000)
          .lean()
          .exec()
          .catch((err) => {
            this.logger.warn(`Merchant search fallback error: ${err?.message}`);
            return [];
          });
      }

      // ── Targeted merchant join: load merchants for offers and products ────
      const merchantIdsNeeded = [
        ...new Set([
          ...(offers || [])
            .map((o: any) => String(o.merchantId || ''))
            .filter(Boolean),
          ...(products || [])
            .map((p: any) => String(p.merchantId || ''))
            .filter(Boolean),
          ...(merchants || [])
            .map((m: any) => String(m.userId || m._id || ''))
            .filter(Boolean),
        ]),
      ];

      const merchantsMap = new Map<string, any>();
      if (merchantIdsNeeded.length > 0) {
        try {
          const offerMerchants = await this.merchantModel
            .find({
              $or: [
                { userId: { $in: merchantIdsNeeded } },
                {
                  _id: {
                    $in: merchantIdsNeeded
                      .filter((id) => Types.ObjectId.isValid(id))
                      .map((id) => new Types.ObjectId(id)),
                  },
                },
              ],
            })
            .select(
              'userId storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto rating averageRating',
            )
            .maxTimeMS(3000)
            .lean()
            .exec();

          (offerMerchants || []).forEach((m: any) => {
            if (m.userId) merchantsMap.set(m.userId.toString(), m);
            if (m._id) merchantsMap.set(m._id.toString(), m);
          });
        } catch (e) {
          this.logger.warn(
            'Search: merchant enrichment failed, offers and products will lack merchant detail',
          );
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
            category:
              m?.storeCategory ||
              offer.businessCategory ||
              offer.category ||
              '',
            subCategory: m?.storeSubCategory || offer.businessSubCategory || '',
            address: m?.storeLocation || '',
            latitude: m?.storeLocationLatitude || null,
            longitude: m?.storeLocationLongitude || null,
            profilePhoto: m?.profilePhoto || m?.shopPhoto || '',
          },
        };
      });

      const mappedProducts = (products || []).map((product: any) => {
        const m = merchantsMap.get(String(product.merchantId || ''));
        return {
          ...product,
          storeName: m?.storeName || product.storeName || '',
          storeLocation: m?.storeLocation || product.storeLocation || '',
          merchant: m
            ? {
                merchantId: product.merchantId,
                name: m.storeName,
                address: m.storeLocation,
                category: m.storeCategory,
              }
            : product.merchant,
        };
      });

      const result = {
        success: true,
        data: {
          merchants: merchants || [],
          products: mappedProducts,
          offers: mappedOffers,
        },
      };

      if (this.redisService) {
        try {
          await this.redisService.set(cacheKey, result, 120);
        } catch (_e) {
          /* ignore */
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

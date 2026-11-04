import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../common/services/email.service';
import { Notification, NotificationDocument } from '../users/schemas/notification.schema';
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
import {
  SearchHistory,
  SearchHistoryDocument,
} from './schemas/search-history.schema';
import {
  SearchDemandKeyword,
  SearchDemandKeywordDocument,
  DemandStatus,
} from './schemas/search-demand-keyword.schema';
import {
  ItemDemandRequest,
  ItemDemandRequestDocument,
  ItemRequestStatus,
} from './schemas/item-demand-request.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RedisService } from '../common/services/redis.service';
import {
  expandQuery,
  getPartialQueryVariants,
  inferCategory,
  getAlgorithmicEdits,
  buildFuzzyPhoneticRegex,
} from './services/search-dictionary';

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
    @InjectModel(SearchHistory.name)
    private readonly searchHistoryModel: Model<SearchHistoryDocument>,
    @InjectModel(SearchDemandKeyword.name)
    private readonly searchDemandKeywordModel: Model<SearchDemandKeywordDocument>,
    @InjectModel(ItemDemandRequest.name)
    private readonly itemDemandRequestModel: Model<ItemDemandRequestDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Execute core DB queries across merchants, products, and offers using a regex pattern.
   */
  private async executeSearchCore(
    regexFallback: RegExp,
    rawQuery: string,
    type: string,
    skip: number,
    safeLimit: number,
  ) {
    // 1. Matching products
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
            .catch(() => [])
        : Promise.resolve([]);

    // 2. Matching offers
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
            .catch(() => [])
        : Promise.resolve([]);

    const [products, offers] = await Promise.all([
      productsPromise,
      offersPromise,
    ]);

    // 3. Matching merchants
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
        .catch(() => []);
    }

    // Join merchant details
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
      } catch (_e) {}
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

    const totalCount =
      (merchants?.length || 0) +
      (mappedProducts?.length || 0) +
      (mappedOffers?.length || 0);

    return {
      merchants: merchants || [],
      mappedProducts,
      mappedOffers,
      totalCount,
    };
  }

  /**
   * Unified search across merchants, products, and offers.
   * Includes:
   * 1. Invisible spelling & Roman Marathi/Hindi/English query expansion.
   * 2. Partial match relaxation (e.g. "red cotton kurti" -> "cotton kurti").
   * 3. Related / Category fallback suggestions if 0 or low results.
   * 4. Zero/Low-result demand tracking.
   */
  async unifiedSearch(
    query: string,
    type: string = 'all',
    page: number = 1,
    limit: number = 16,
    userId?: string,
    sessionId?: string,
    location?: string,
    strict: boolean = false,
  ) {
    if (!query || !query.trim()) {
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
        meta: {
          originalQuery: '',
          appliedQuery: '',
          isCorrected: false,
          isPartialMatch: false,
          fallbackLevel: 'EMPTY',
          totalResults: 0,
        },
      };
    }

    const rawQuery = query.trim();
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 16));
    const skip = (safePage - 1) * safeLimit;

    // 1. Expand query with Roman Marathi/Hindi transliteration, typo corrections, & synonyms
    const expansion = expandQuery(rawQuery);
    let corrected = expansion.corrected;
    let isCorrected = expansion.isCorrected;
    const equivalents = expansion.equivalents;

    const searchTerms = strict ? [rawQuery] : equivalents;
    const escapedTerms = searchTerms.map((t) =>
      t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const regexPattern = new RegExp(escapedTerms.join('|'), 'i');

    const cacheKey = `golo:search:unified:${rawQuery.toLowerCase()}:${strict ? 'strict' : 'exp'}:${type}:${safePage}:${safeLimit}`;
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<any>(cacheKey);
        if (cached) {
          const cachedTotal =
            cached.meta?.totalResults ??
            (cached.data?.merchants?.length || 0) +
              (cached.data?.products?.length || 0) +
              (cached.data?.offers?.length || 0);
          if (cachedTotal < 10) {
            this.trackDemandKeyword(
              rawQuery,
              cachedTotal,
              cached.data,
              userId,
              sessionId,
              location,
            ).catch(() => {});
          }
          return cached;
        }
      } catch (_e) {}
    }

    try {
      // ── TIER 1 & 2: Primary & Expanded Search ──
      let searchExec = await this.executeSearchCore(
        regexPattern,
        rawQuery,
        type,
        skip,
        safeLimit,
      );
      let isPartialMatch = false;
      let matchedQuery = rawQuery;
      let fallbackLevel = isCorrected && !strict ? 'EXPANDED' : 'EXACT';

      // ── TIER 2: Global Algorithmic Typo & Fuzzy Matching (Works for ALL words) ──
      if (searchExec.totalCount === 0 && !strict) {
        // 2a. Check algorithmic 1-edit distance variants (deletions, transpositions, double-letter collapses)
        const tokens = rawQuery.split(/\s+/).filter(Boolean);
        const editCandidates: string[] = [];

        for (const token of tokens) {
          const edits = getAlgorithmicEdits(token);
          editCandidates.push(...edits);
        }

        if (editCandidates.length > 0) {
          const escapedEdits = editCandidates.map((t) =>
            t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          );
          const editPattern = new RegExp(`\\b(?:${escapedEdits.join('|')})`, 'i');
          const editExec = await this.executeSearchCore(
            editPattern,
            rawQuery,
            type,
            skip,
            safeLimit,
          );

          if (editExec.totalCount > 0) {
            searchExec = editExec;
            fallbackLevel = 'FUZZY';
            isCorrected = true;
            // Identify matched candidate for appliedQuery display
            const bestCandidate = editCandidates.find((c) =>
              editExec.mappedProducts.some((p: any) =>
                new RegExp(`\\b${c}`, 'i').test(p.name || ''),
              ) ||
              editExec.mappedOffers.some((o: any) =>
                new RegExp(`\\b${c}`, 'i').test(o.title || ''),
              ) ||
              editExec.merchants.some((m: any) =>
                new RegExp(`\\b${c}`, 'i').test(m.storeName || ''),
              ),
            );
            if (bestCandidate) {
              corrected = bestCandidate;
              matchedQuery = bestCandidate;
            }
          }
        }

        // 2b. If still 0, try algorithmic flexible phonetic regex (vowels & Roman Marathi/Hindi flexibility)
        if (searchExec.totalCount === 0) {
          const fuzzyRegex = buildFuzzyPhoneticRegex(rawQuery);
          if (fuzzyRegex) {
            const fuzzyExec = await this.executeSearchCore(
              fuzzyRegex,
              rawQuery,
              type,
              skip,
              safeLimit,
            );
            if (fuzzyExec.totalCount > 0) {
              searchExec = fuzzyExec;
              fallbackLevel = 'FUZZY';
              isCorrected = true;
            }
          }
        }
      }

      // ── TIER 3: Partial Match Relaxation (if 0 results and multi-word query) ──
      if (searchExec.totalCount === 0 && !strict) {
        const partialVariants = getPartialQueryVariants(rawQuery);
        for (const variant of partialVariants) {
          const variantPattern = new RegExp(
            variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          );
          const variantExec = await this.executeSearchCore(
            variantPattern,
            variant,
            type,
            skip,
            safeLimit,
          );
          if (variantExec.totalCount > 0) {
            searchExec = variantExec;
            isPartialMatch = true;
            matchedQuery = variant;
            fallbackLevel = 'PARTIAL';
            break;
          }
        }
      }

      // ── TIER 4: Related / Category Fallback (if total results < 4 or 0) ──
      let relatedItems: any = null;
      const inferredCat = inferCategory(rawQuery);

      if (searchExec.totalCount < 4 && inferredCat) {
        try {
          const [relOffers, relProds] = await Promise.all([
            this.offerModel
              .find({
                status: { $in: ['approved', 'active'] },
                $or: [
                  { businessCategory: { $regex: new RegExp(inferredCat, 'i') } },
                  { category: { $regex: new RegExp(inferredCat, 'i') } },
                ],
              })
              .limit(8)
              .maxTimeMS(3000)
              .lean()
              .exec()
              .catch(() => []),
            this.merchantProductModel
              .find({ category: { $regex: new RegExp(inferredCat, 'i') } })
              .limit(8)
              .maxTimeMS(3000)
              .lean()
              .exec()
              .catch(() => []),
          ]);

          if (relOffers.length > 0 || relProds.length > 0) {
            relatedItems = {
              category: inferredCat,
              offers: relOffers.map((o: any) => ({
                ...o,
                offerId: o._id?.toString(),
              })),
              products: relProds,
            };
            if (searchExec.totalCount === 0) {
              fallbackLevel = 'RELATED';
            }
          }
        } catch (_relErr) {}
      }

      if (searchExec.totalCount === 0 && !relatedItems) {
        fallbackLevel = 'EMPTY';
      }

      const result = {
        success: true,
        data: {
          merchants: searchExec.merchants,
          products: searchExec.mappedProducts,
          offers: searchExec.mappedOffers,
        },
        meta: {
          originalQuery: rawQuery,
          appliedQuery: strict
            ? rawQuery
            : isPartialMatch
            ? matchedQuery
            : isCorrected
            ? corrected
            : rawQuery,
          isCorrected: isCorrected && !strict,
          correctedQuery: corrected,
          isPartialMatch,
          matchedQuery,
          fallbackLevel,
          totalResults: searchExec.totalCount,
          inferredCategory: inferredCat || null,
          relatedItems,
        },
      };

      // ── Track keywords yielding < 10 results for sales & marketing ──
      if (searchExec.totalCount < 10) {
        this.trackDemandKeyword(
          rawQuery,
          searchExec.totalCount,
          result.data,
          userId,
          sessionId,
          location,
        ).catch(() => {});
      }

      if (this.redisService) {
        try {
          await this.redisService.set(cacheKey, result, 120);
        } catch (_e) {}
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Unified search error: ${error?.message || error}`);
      this.trackDemandKeyword(
        rawQuery,
        0,
        { merchants: [], products: [], offers: [] },
        userId,
        sessionId,
        location,
      ).catch(() => {});
      return {
        success: true,
        data: { merchants: [], products: [], offers: [] },
        meta: {
          originalQuery: rawQuery,
          appliedQuery: rawQuery,
          isCorrected: false,
          isPartialMatch: false,
          fallbackLevel: 'EMPTY',
          totalResults: 0,
        },
      };
    }
  }

  /**
   * Save a search query into search history (database).
   * Upserts the query so it bumps to the top of recent searches.
   */
  async saveSearchHistory(
    userId?: string,
    sessionId?: string,
    query?: string,
    location?: string,
  ) {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return null;

    const safeSessionId = (sessionId && sessionId.trim()) ? sessionId.trim() : (!userId ? 'guest_default' : undefined);

    const filter: any = {};
    if (userId) {
      filter.userId = userId;
    } else if (safeSessionId) {
      filter.sessionId = safeSessionId;
    } else {
      filter.sessionId = 'guest_default';
    }

    filter.query = cleanQuery;

    try {
      const record = await this.searchHistoryModel.findOneAndUpdate(
        filter,
        {
          $set: {
            userId: userId || undefined,
            sessionId: safeSessionId || undefined,
            query: cleanQuery,
            location: (location || '').trim(),
            searchedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // If user is authenticated, also sync to user document searchHistory array
      if (userId) {
        try {
          await this.userModel.findByIdAndUpdate(userId, {
            $pull: { searchHistory: cleanQuery },
          });
          await this.userModel.findByIdAndUpdate(userId, {
            $push: {
              searchHistory: {
                $each: [cleanQuery],
                $position: 0,
                $slice: 30,
              },
            },
          });
        } catch (_uErr) {
          // Non-blocking
        }
      }

      // If user is authenticated and passed sessionId, link previous guest searches
      if (userId && safeSessionId && safeSessionId !== userId && safeSessionId !== 'guest_default') {
        this.searchHistoryModel
          .updateMany(
            { sessionId: safeSessionId, userId: { $exists: false } },
            { $set: { userId } },
          )
          .catch(() => {});
      }

      return record;
    } catch (err: any) {
      this.logger.warn(`Failed to save search history for "${cleanQuery}": ${err?.message}`);
      return null;
    }
  }

  /**
   * Get latest search history queries (default 6).
   */
  async getSearchHistory(
    userId?: string,
    sessionId?: string,
    limit: number = 6,
  ) {
    const safeSessionId = (sessionId && sessionId.trim()) ? sessionId.trim() : (!userId ? 'guest_default' : undefined);
    const filter: any = {};
    if (userId && safeSessionId) {
      filter.$or = [{ userId }, { sessionId: safeSessionId }];
    } else if (userId) {
      filter.userId = userId;
    } else if (safeSessionId) {
      filter.sessionId = safeSessionId;
    } else {
      return [];
    }

    const safeLimit = Math.min(20, Math.max(1, Number(limit) || 6));

    const records = await this.searchHistoryModel
      .find(filter)
      .sort({ searchedAt: -1 })
      .limit(safeLimit * 3)
      .lean();

    const seen = new Set<string>();
    const unique = [];

    for (const r of records) {
      const lower = r.query.toLowerCase().trim();
      if (!seen.has(lower)) {
        seen.add(lower);
        unique.push({
          id: (r as any)._id?.toString(),
          query: r.query,
          location: r.location || '',
          searchedAt: r.searchedAt,
        });
      }
      if (unique.length >= safeLimit) break;
    }

    return unique;
  }

  /**
   * Delete a single search item by id or query
   */
  async deleteSearchHistoryItem(
    userId?: string,
    sessionId?: string,
    id?: string,
    query?: string,
  ) {
    const safeSessionId = (sessionId && sessionId.trim()) ? sessionId.trim() : (!userId ? 'guest_default' : undefined);
    const filter: any = {};
    if (userId && safeSessionId) {
      filter.$or = [{ userId }, { sessionId: safeSessionId }];
    } else if (userId) {
      filter.userId = userId;
    } else if (safeSessionId) {
      filter.sessionId = safeSessionId;
    } else {
      return { success: false };
    }

    if (id) {
      try {
        filter._id = new Types.ObjectId(id);
      } catch {
        filter._id = id;
      }
    } else if (query) {
      filter.query = query.trim();
    } else {
      return { success: false };
    }

    await this.searchHistoryModel.deleteOne(filter);
    return { success: true };
  }

  /**
   * Clear all search history for user / session
   */
  async clearSearchHistory(userId?: string, sessionId?: string) {
    const safeSessionId = (sessionId && sessionId.trim()) ? sessionId.trim() : (!userId ? 'guest_default' : undefined);
    const filter: any = {};
    if (userId && safeSessionId) {
      filter.$or = [{ userId }, { sessionId: safeSessionId }];
    } else if (userId) {
      filter.userId = userId;
    } else if (safeSessionId) {
      filter.sessionId = safeSessionId;
    } else {
      return { success: false };
    }

    await this.searchHistoryModel.deleteMany(filter);

    if (userId) {
      this.userModel
        .findByIdAndUpdate(userId, { $set: { searchHistory: [] } })
        .catch(() => {});
    }

    return { success: true };
  }

  /**
   * Track search keywords that returned zero or low (< 10) results.
   * Tracks total searches, unique user demand, locations, and result breakdown.
   */
  async trackDemandKeyword(
    query: string,
    totalResults: number,
    breakdownData?: { merchants?: any[]; products?: any[]; offers?: any[] },
    userId?: string,
    sessionId?: string,
    location?: string,
  ) {
    const rawQuery = (query || '').trim();
    if (!rawQuery) return null;

    const normalizedKeyword = rawQuery.toLowerCase();
    const cleanLocation = (location || '').trim();
    const storesCount = breakdownData?.merchants?.length || 0;
    const productsCount = breakdownData?.products?.length || 0;
    const offersCount = breakdownData?.offers?.length || 0;

    try {
      const existing = await this.searchDemandKeywordModel.findOne({
        keyword: normalizedKeyword,
      });

      if (!existing) {
        // Initial insert
        const newRecord = await this.searchDemandKeywordModel.findOneAndUpdate(
          { keyword: normalizedKeyword },
          {
            $setOnInsert: {
              keyword: normalizedKeyword,
              originalQueries: [rawQuery],
              searchCount: 1,
              uniqueUsersCount: 1,
              userIds: userId ? [userId] : [],
              sessionIds: sessionId ? [sessionId] : [],
              locations: cleanLocation
                ? [{ location: cleanLocation, count: 1 }]
                : [],
              firstSearchedAt: new Date(),
              status: DemandStatus.PENDING,
            },
            $set: {
              lastSearchedAt: new Date(),
              lastResultCount: totalResults,
              breakdown: { storesCount, productsCount, offersCount },
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        return newRecord;
      }

      // Check if user is known
      const isKnownUser =
        (userId && existing.userIds && existing.userIds.includes(userId)) ||
        (!userId &&
          sessionId &&
          existing.sessionIds &&
          existing.sessionIds.includes(sessionId));
      const isNewUser = (userId || sessionId) && !isKnownUser;

      const updateOp: any = {
        $inc: {
          searchCount: 1,
          ...(isNewUser ? { uniqueUsersCount: 1 } : {}),
        },
        $set: {
          lastSearchedAt: new Date(),
          lastResultCount: totalResults,
          breakdown: { storesCount, productsCount, offersCount },
        },
        $addToSet: {
          originalQueries: rawQuery,
          ...(userId ? { userIds: userId } : {}),
          ...(sessionId ? { sessionIds: sessionId } : {}),
        },
      };

      // Handle location count
      if (cleanLocation) {
        const locIdx = existing.locations
          ? existing.locations.findIndex(
              (l) =>
                l.location &&
                l.location.toLowerCase() === cleanLocation.toLowerCase(),
            )
          : -1;

        if (locIdx >= 0) {
          const locMatchedName = existing.locations[locIdx].location;
          await this.searchDemandKeywordModel.updateOne(
            {
              keyword: normalizedKeyword,
              'locations.location': locMatchedName,
            },
            {
              $inc: { 'locations.$.count': 1 },
            },
          );
        } else {
          updateOp.$push = {
            locations: { location: cleanLocation, count: 1 },
          };
        }
      }

      const updated = await this.searchDemandKeywordModel.findOneAndUpdate(
        { keyword: normalizedKeyword },
        updateOp,
        { new: true },
      );

      return updated;
    } catch (err: any) {
      this.logger.warn(
        `Failed to track demand keyword "${normalizedKeyword}": ${err?.message}`,
      );
      return null;
    }
  }

  /**
   * Get paginated demand keywords for the sales & marketing team
   */
  async getDemandKeywords(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: string;
    status?: string;
    search?: string;
    location?: string;
    minSearches?: number;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (options.status && options.status !== 'ALL') {
      filter.status = options.status;
    }

    if (options.search && options.search.trim()) {
      const reg = new RegExp(
        options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [{ keyword: reg }, { originalQueries: reg }];
    }

    if (options.location && options.location.trim()) {
      const locReg = new RegExp(
        options.location.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['locations.location'] = locReg;
    }

    if (options.minSearches && Number(options.minSearches) > 0) {
      filter.searchCount = { $gte: Number(options.minSearches) };
    }

    const sortField = options.sortBy || 'searchCount';
    const sortOrder = options.order === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [items, total] = await Promise.all([
      this.searchDemandKeywordModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.searchDemandKeywordModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Summary stats for sales / marketing demand analysis
   */
  async getDemandKeywordStats() {
    const [
      totalDemandKeywords,
      aggregations,
      topKeywords,
      pendingCount,
      inProgressCount,
      onboardedCount,
    ] = await Promise.all([
      this.searchDemandKeywordModel.countDocuments(),
      this.searchDemandKeywordModel.aggregate([
        {
          $group: {
            _id: null,
            totalUnmetSearches: { $sum: '$searchCount' },
            totalUniqueUsers: { $sum: '$uniqueUsersCount' },
          },
        },
      ]),
      this.searchDemandKeywordModel
        .find()
        .sort({ searchCount: -1 })
        .limit(10)
        .select('keyword searchCount uniqueUsersCount lastResultCount locations status')
        .lean(),
      this.searchDemandKeywordModel.countDocuments({ status: DemandStatus.PENDING }),
      this.searchDemandKeywordModel.countDocuments({ status: DemandStatus.IN_PROGRESS }),
      this.searchDemandKeywordModel.countDocuments({ status: DemandStatus.ONBOARDED }),
    ]);

    const totalUnmetSearches = aggregations?.[0]?.totalUnmetSearches || 0;
    const totalUniqueUsers = aggregations?.[0]?.totalUniqueUsers || 0;

    return {
      totalDemandKeywords,
      totalUnmetSearches,
      totalUniqueUsers,
      pendingCount,
      inProgressCount,
      onboardedCount,
      topMissingKeywords: topKeywords,
    };
  }

  /**
   * Update status/notes of a demand keyword lead
   */
  async updateDemandKeywordStatus(
    id: string,
    status?: string,
    notes?: string,
    suggestedCategory?: string,
  ) {
    const update: any = {};
    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;
    if (suggestedCategory !== undefined) update.suggestedCategory = suggestedCategory;

    let filter: any;
    try {
      filter = { _id: new Types.ObjectId(id) };
    } catch {
      filter = { _id: id };
    }

    const updated = await this.searchDemandKeywordModel.findOneAndUpdate(
      filter,
      { $set: update },
      { new: true },
    );
    return updated;
  }

  /**
   * Delete a demand keyword
   */
  async deleteDemandKeyword(id: string) {
    let filter: any;
    try {
      filter = { _id: new Types.ObjectId(id) };
    } catch {
      filter = { _id: id };
    }
    await this.searchDemandKeywordModel.deleteOne(filter);
    return { success: true };
  }

  /**
   * Analytics on zero-result searches and catalogue health benchmarks.
   * Tracks total searches, zero-result searches, zero-result rate %,
   * top missing keywords, and flags a Catalogue Health Alert if rate > 10-15%.
   */
  async getZeroResultAnalytics() {
    const [
      totalHistorySearches,
      demandAgg,
      zeroResultKeywordsCount,
      topZeroKeywords,
      topLowInventoryKeywords,
      totalUserRequests,
      pendingUserRequests,
    ] = await Promise.all([
      this.searchHistoryModel.countDocuments(),
      this.searchDemandKeywordModel.aggregate([
        {
          $group: {
            _id: null,
            totalDemandSearches: { $sum: '$searchCount' },
            zeroResultSearches: {
              $sum: {
                $cond: [{ $eq: ['$lastResultCount', 0] }, '$searchCount', 0],
              },
            },
            lowResultSearches: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$lastResultCount', 0] },
                      { $lt: ['$lastResultCount', 10] },
                    ],
                  },
                  '$searchCount',
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.searchDemandKeywordModel.countDocuments({ lastResultCount: 0 }),
      this.searchDemandKeywordModel
        .find({ lastResultCount: 0 })
        .sort({ searchCount: -1 })
        .limit(10)
        .select('keyword searchCount uniqueUsersCount locations lastSearchedAt status suggestedCategory')
        .lean(),
      this.searchDemandKeywordModel
        .find({ lastResultCount: { $gt: 0, $lt: 10 } })
        .sort({ searchCount: -1 })
        .limit(10)
        .select('keyword searchCount uniqueUsersCount lastResultCount locations lastSearchedAt status')
        .lean(),
      this.itemDemandRequestModel.countDocuments(),
      this.itemDemandRequestModel.countDocuments({ status: ItemRequestStatus.OPEN }),
    ]);

    const totalDemandSearches = demandAgg?.[0]?.totalDemandSearches || 0;
    const zeroResultSearches = demandAgg?.[0]?.zeroResultSearches || 0;
    const lowResultSearches = demandAgg?.[0]?.lowResultSearches || 0;

    // Estimate total system searches
    const totalSearches = Math.max(totalHistorySearches, totalDemandSearches, 1);
    const zeroResultRatePercent = Number(
      ((zeroResultSearches / totalSearches) * 100).toFixed(1),
    );

    // Catalogue health status:
    // Healthy: < 10%
    // Warning / Needs Attention: 10% - 15%
    // Catalogue Gap Alert: > 15%
    let healthStatus: 'HEALTHY' | 'NEEDS_ATTENTION' | 'CATALOGUE_GAP_ALERT' = 'HEALTHY';
    let healthMessage = 'Zero-result search rate is within healthy parameters (< 10%).';

    if (zeroResultRatePercent > 15) {
      healthStatus = 'CATALOGUE_GAP_ALERT';
      healthMessage =
        'High zero-result search rate (> 15%). Immediate merchant onboarding needed in high-demand categories to prevent customer drop-off.';
    } else if (zeroResultRatePercent >= 10) {
      healthStatus = 'NEEDS_ATTENTION';
      healthMessage =
        'Zero-result search rate is elevated (10-15%). Monitor trending missing queries and reach out to matching local sellers.';
    }

    return {
      healthStatus,
      healthMessage,
      benchmark: {
        healthyThreshold: '< 10%',
        warningThreshold: '10% - 15%',
        alertThreshold: '> 15%',
      },
      metrics: {
        totalSearches,
        zeroResultSearches,
        lowResultSearches,
        zeroResultRatePercent,
        zeroResultKeywordsCount,
        totalUserRequests,
        pendingUserRequests,
      },
      topZeroKeywords,
      topLowInventoryKeywords,
    };
  }

/**
   * Log an item demand notification request from user (When an item is unavailable)
   */
  async createItemDemandRequest(data: {
    keyword: string;
    originalQuery?: string;
    userId?: string;
    sessionId?: string;
    userContact?: string;
    userName?: string;
    location?: string;
    notes?: string;
  }) {
    const cleanKeyword = (data.keyword || data.originalQuery || '').trim().toLowerCase();
    if (!cleanKeyword) {
      return { success: false, message: 'Keyword is required' };
    }
    const cleanContact = (data.userContact || '').trim();
    if (!cleanContact) {
      return { success: false, message: 'Phone number or email is required' };
    }

    let finalUserId = data.userId;
    // If guest user submitted an email or phone, check if a registered user exists
    if (!finalUserId && cleanContact) {
      try {
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanContact);
        const safeContact = cleanContact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const userMatch = await this.userModel
          .findOne(
            isEmail
              ? { email: { $regex: new RegExp(`^${safeContact}$`, 'i') } }
              : { $or: [{ phone: cleanContact }, { mobile: cleanContact }] }
          )
          .select('_id')
          .lean();
        if (userMatch) {
          finalUserId = String(userMatch._id);
        }
      } catch (_e) {}
    }

    const request = await this.itemDemandRequestModel.create({
      keyword: cleanKeyword,
      originalQuery: (data.originalQuery || data.keyword || '').trim(),
      userId: finalUserId || undefined,
      sessionId: data.sessionId || undefined,
      userContact: cleanContact,
      userName: (data.userName || '').trim(),
      location: (data.location || '').trim(),
      notes: (data.notes || '').trim(),
      status: ItemRequestStatus.OPEN,
      requestedAt: new Date(),
    });

    // Also track in demand keyword model
    this.trackDemandKeyword(
      cleanKeyword,
      0,
      { merchants: [], products: [], offers: [] },
      finalUserId,
      data.sessionId,
      data.location,
    ).catch(() => {});

    this.logger.log(`Saved item demand request for "${cleanKeyword}" from contact: ${cleanContact}`);

    return {
      success: true,
      message: 'Your request has been saved. We will notify you when this item becomes available!',
      data: request,
    };
  }

  /**
   * Get user item demand requests for admin/sales team
   */
  async getItemDemandRequests(options: {
    page?: number;
    limit?: number;
    status?: string;
    keyword?: string;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (options.status && options.status !== 'ALL') {
      filter.status = options.status;
    }
    if (options.keyword && options.keyword.trim()) {
      filter.keyword = new RegExp(
        options.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
    }

    const [items, total] = await Promise.all([
      this.itemDemandRequestModel
        .find(filter)
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.itemDemandRequestModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update item demand request status (e.g. CONTACTED, AVAILABLE)
   */
  async updateItemDemandRequestStatus(
    id: string,
    status: ItemRequestStatus,
    notes?: string,
  ) {
    let filter: any;
    try {
      filter = { _id: new Types.ObjectId(id) };
    } catch {
      filter = { _id: id };
    }

    const update: any = { status };
    if (notes !== undefined) update.notes = notes;

    const updated = await this.itemDemandRequestModel.findOneAndUpdate(
      filter,
      { $set: update },
      { new: true },
    );
    return updated;
  }

  /**
   * Check open demand requests and notify users when a new item/product/offer/ad matches or is related.
   */
  async checkAndNotifyDemandRequests(item: {
    itemId: string;
    itemType: 'product' | 'offer' | 'ad';
    title: string;
    category?: string;
    description?: string;
    merchantId?: string;
    merchantName?: string;
    price?: number;
    imageUrl?: string;
    location?: string;
    url?: string;
  }) {
    if (!item || !item.title) return { notifiedCount: 0 };

    const itemTitle = (item.title || '').trim().toLowerCase();
    const itemDesc = (item.description || '').trim().toLowerCase();
    const itemCat = (item.category || '').trim().toLowerCase();
    const itemFullText = `${itemTitle} ${itemDesc} ${itemCat}`;

    // Resolve target URL
    let targetUrl = item.url;
    if (!targetUrl) {
      if (item.itemType === 'product') {
        targetUrl = `/nearby-deals/product?id=${item.itemId}`;
      } else if (item.itemType === 'offer') {
        targetUrl = `/nearby-deals/deal?offerId=${item.itemId}`;
      } else {
        targetUrl = `/product/${item.itemId}`;
      }
    }

    const frontendBaseUrl =
      this.configService.get('FRONTEND_URL') ||
      'https://goloo-inky.vercel.app';
    const absoluteTargetUrl = targetUrl.startsWith('http')
      ? targetUrl
      : `${frontendBaseUrl.replace(/\/+$/, '')}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;

    // Find all OPEN demand requests
    const openRequests = await this.itemDemandRequestModel
      .find({ status: ItemRequestStatus.OPEN })
      .exec();

    if (!openRequests || openRequests.length === 0) {
      return { notifiedCount: 0 };
    }

    let notifiedCount = 0;

    for (const req of openRequests) {
      const keyword = (req.keyword || '').trim().toLowerCase();
      const originalQuery = (req.originalQuery || '').trim().toLowerCase();
      const notes = (req.notes || '').trim().toLowerCase();

      let isMatch = false;

      // 1. Direct match: item title or description contains the keyword (or vice versa)
      if (keyword && (itemTitle.includes(keyword) || (keyword.length > 3 && itemFullText.includes(keyword)))) {
        isMatch = true;
      }

      // 2. Original query match
      if (!isMatch && originalQuery && (itemTitle.includes(originalQuery) || (originalQuery.length > 3 && itemFullText.includes(originalQuery)))) {
        isMatch = true;
      }

      // 3. Token match: individual words of keyword/query
      if (!isMatch) {
        const queryTokens = (originalQuery || keyword)
          .split(/[\s,.-]+/)
          .filter((t) => t.length >= 3 && !['the', 'and', 'for', 'with', 'need', 'want', 'please', 'any'].includes(t));

        if (queryTokens.length > 0) {
          const tokenMatches = queryTokens.filter((t) => itemTitle.includes(t));
          if (tokenMatches.length >= Math.ceil(queryTokens.length / 2)) {
            isMatch = true;
          }
        }
      }

      // 4. Dictionary Expansion (Synonyms, Transliteration, Typo corrections)
      if (!isMatch && keyword) {
        const expansion = expandQuery(keyword);
        for (const eq of expansion.equivalents) {
          const cleanEq = eq.toLowerCase().trim();
          if (cleanEq.length >= 3 && itemTitle.includes(cleanEq)) {
            isMatch = true;
            break;
          }
        }
      }

      // 5. Category Inference Match
      if (!isMatch && keyword) {
        const inferred = inferCategory(keyword);
        if (inferred && itemCat && (itemCat.includes(inferred.toLowerCase()) || inferred.toLowerCase().includes(itemCat))) {
          if (notes) {
            const noteTokens = notes.split(/[\s,.-]+/).filter((t) => t.length >= 3);
            if (noteTokens.some((t) => itemTitle.includes(t))) {
              isMatch = true;
            }
          }
        }
      }

      // 6. Notes match
      if (!isMatch && notes) {
        const noteTokens = notes.split(/[\s,.-]+/).filter((t) => t.length >= 3 && !['need', 'want', 'brand', 'size', 'specific', 'please'].includes(t));
        if (noteTokens.some((t) => itemTitle.includes(t))) {
          isMatch = true;
        }
      }

      if (!isMatch) continue;

      // MATCH FOUND! Deliver notifications
      this.logger.log(
        `[Demand Match] Request for "${keyword || originalQuery}" matched ${item.itemType} "${item.title}"`,
      );

      // 1. Resolve or find recipient User
      let recipientUserId = req.userId;
      if (!recipientUserId && req.userContact) {
        try {
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.userContact);
          const safeContact = req.userContact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const userDoc = await this.userModel
            .findOne(
              isEmail
                ? { email: { $regex: new RegExp(`^${safeContact}$`, 'i') } }
                : { $or: [{ phone: req.userContact }, { mobile: req.userContact }] }
            )
            .select('_id')
            .lean();
          if (userDoc) {
            recipientUserId = String(userDoc._id);
          }
        } catch (_err) {}
      }

      // 2. Create in-app notification if user id exists
      if (recipientUserId) {
        try {
          await this.notificationModel.create({
            recipientId: String(recipientUserId),
            senderId: String(item.merchantId || 'system'),
            senderName: item.merchantName || 'GOLO Local Store',
            productId: item.itemType === 'product' ? String(item.itemId) : undefined,
            offerId: item.itemType === 'offer' ? String(item.itemId) : undefined,
            adId: item.itemType === 'ad' ? String(item.itemId) : undefined,
            targetUrl,
            type: 'item_available',
            title: `Good news! "${item.title}" is now available`,
            message: `An item matching your request for "${req.originalQuery || req.keyword}" is now available at ${item.merchantName || 'a local store'}. Tap to view details!`,
            read: false,
            createdAt: new Date(),
          });
        } catch (notifErr: any) {
          this.logger.warn(`Failed to create in-app notification: ${notifErr.message}`);
        }
      }

      // 3. Send Email Notification if contact is email
      if (req.userContact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.userContact)) {
        try {
          await this.emailService.sendItemAvailableEmail({
            toEmail: req.userContact,
            userName: req.userName || 'Valued Customer',
            requestedKeyword: req.originalQuery || req.keyword,
            itemName: item.title,
            itemType: item.itemType,
            itemPrice: item.price,
            storeName: item.merchantName || 'Local Merchant',
            targetUrl: absoluteTargetUrl,
          });
        } catch (emailErr: any) {
          this.logger.warn(`Failed to send item available email: ${emailErr.message}`);
        }
      }

      // 4. Mark request as AVAILABLE
      req.status = ItemRequestStatus.AVAILABLE;
      req.notifiedAt = new Date();
      req.notifiedProductId = String(item.itemId);
      req.notifiedItemTitle = item.title;
      req.notifiedItemType = item.itemType;
      await req.save();

      notifiedCount++;
    }

    return { notifiedCount };
  }

  @OnEvent('product.created')
  async handleProductCreated(payload: any) {
    try {
      await this.checkAndNotifyDemandRequests({
        itemId: payload.productId || payload._id || payload.itemId,
        itemType: 'product',
        title: payload.name || payload.title,
        category: payload.category,
        description: payload.description,
        merchantId: payload.merchantId,
        merchantName: payload.merchantName || payload.storeName,
        price: payload.price,
        imageUrl: payload.imageUrl || (payload.images && payload.images[0]),
      });
    } catch (e: any) {
      this.logger.error(`Error in handleProductCreated: ${e.message}`);
    }
  }

  @OnEvent('offer.created')
  async handleOfferCreated(payload: any) {
    try {
      await this.checkAndNotifyDemandRequests({
        itemId: payload.offerId || payload.requestId || payload._id || payload.itemId,
        itemType: 'offer',
        title: payload.title,
        category: payload.category || payload.businessCategory,
        description: payload.description,
        merchantId: payload.merchantId,
        merchantName: payload.merchantName,
        price: payload.price || payload.totalPrice,
        imageUrl: payload.imageUrl,
      });
    } catch (e: any) {
      this.logger.error(`Error in handleOfferCreated: ${e.message}`);
    }
  }

  @OnEvent('ad.created')
  async handleAdCreated(payload: any) {
    try {
      await this.checkAndNotifyDemandRequests({
        itemId: payload.adId || payload._id || payload.itemId,
        itemType: 'ad',
        title: payload.title,
        category: payload.category,
        description: payload.description,
        price: payload.price,
        imageUrl: payload.imageUrl || (payload.images && payload.images[0]),
      });
    } catch (e: any) {
      this.logger.error(`Error in handleAdCreated: ${e.message}`);
    }
  }

}

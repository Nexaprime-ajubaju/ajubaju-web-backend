import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka/kafka.service';
import { RedisService } from '../common/services/redis.service';
import { OfferPromotion, OfferPromotionDocument, OfferPromotionStatus, OfferPaymentStatus } from './schemas/offer-promotion.schema';
import { Voucher, VoucherDocument, VoucherStatus } from '../vouchers/schemas/voucher.schema';
// Banner models removed to keep offers module independent from banners
import { User, UserDocument } from '../users/schemas/user.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';

@Injectable()
export class OffersService implements OnModuleInit {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @InjectModel(OfferPromotion.name) private readonly offerModel: Model<OfferPromotionDocument>,
    @InjectModel(Voucher.name) private readonly voucherModel: Model<VoucherDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<MerchantDocument>,
    private readonly redisService: RedisService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private offerMerchantCacheKey(merchantId: string) {
    return `golo:offers:merchant:${merchantId}`;
  }

  private offerTemplateCacheKey(merchantId: string) {
    return `golo:offers:template:${merchantId}`;
  }

  private isExpiredDate(value?: Date | string | null): boolean {
    if (!value) return false;
    const expiresAt = new Date(value).getTime();
    return Number.isFinite(expiresAt) && expiresAt < Date.now();
  }

  private readonly legacyOfferCategorySet = new Set([
    'special',
    'festival',
    'limited time',
    'combo',
    'clearance',
  ]);

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private calculateDistanceKm(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ): number {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(latitudeB - latitudeA);
    const dLon = this.toRadians(longitudeB - longitudeA);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(latitudeA)) *
        Math.cos(this.toRadians(latitudeB)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private hasValidMerchantCoordinates(latitude: number, longitude: number): boolean {
    const inValidRange =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    if (!inValidRange) return false;
    return !(Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001);
  }

  private parseCalendarDate(dateStr: string): Date | null {
    const trimmed = String(dateStr || '').trim();
    if (!trimmed) {
      return null;
    }

    const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
    if (dateOnlyMatch) {
      const [year, month, day] = trimmed.split('-').map(Number);
      const normalized = new Date(year, month - 1, day);
      if (Number.isNaN(normalized.getTime())) {
        return null;
      }
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const normalized = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    );
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private normalizeDateStrings(dateStrings: string[] = []): Date[] {
    return Array.from(new Set(dateStrings))
      .map((dateStr) => this.parseCalendarDate(dateStr))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  // Legacy detection removed — offers are handled only from `offers` collection
  private isLikelyLegacyOffer(_: any): boolean {
    return false;
  }

  async onModuleInit() {
    try {
      const indexes = await this.offerModel.collection.indexes();
      const staleIdempotencyIndexes = indexes.filter((idx: any) => {
        const keys = Object.keys(idx?.key || {});
        return keys.includes('idempotencyKey');
      });

      for (const indexDef of staleIdempotencyIndexes) {
        const indexName = indexDef?.name;
        if (!indexName) continue;
        await this.offerModel.collection.dropIndex(indexName);
        this.logger.warn(`[Offers] Dropped legacy index on startup: ${indexName}`);
      }
    } catch (error) {
      const err = error as any;
      this.logger.warn(`[Offers] Index cleanup skipped: ${err?.message || 'unknown error'}`);
    }
  }

  async submitOfferPromotionRequest(merchantId: string, payload: any) {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new BadRequestException('Invalid offer payload');
      }

      this.logger.log(`[submitOfferPromotionRequest] merchantId=${merchantId}, payload keys=${Object.keys(payload || {}).join(',')}`);
      
      const merchant = await this.userModel.findById(merchantId).select('name email role accountType').lean().exec();
      if (!merchant) {
        this.logger.error(`[submitOfferPromotionRequest] Merchant not found: ${merchantId}`);
        throw new NotFoundException('Merchant not found');
      }
      this.logger.log(`[submitOfferPromotionRequest] Merchant found: ${merchant.name}, role=${merchant.role}, accountType=${merchant.accountType}`);
      
      if (merchant.role !== 'merchant' && merchant.accountType !== 'merchant') {
        throw new BadRequestException('Only merchants can submit offers');
      }

      const merchantProfile = await this.merchantModel.findOne({ userId: merchantId }).select('storeLocationLatitude storeLocationLongitude').lean().exec();
      this.logger.log(`[submitOfferPromotionRequest] Merchant profile: ${JSON.stringify(merchantProfile)}`);
      
      const latitude = Number(merchantProfile?.storeLocationLatitude);
      const longitude = Number(merchantProfile?.storeLocationLongitude);
      const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
      if (!hasCoords) throw new BadRequestException('Store coordinates missing. Set store location before publishing offers.');

    const normalizedDates = Array.isArray(payload.selectedDates) ? this.normalizeDateStrings(payload.selectedDates) : [];
    if (!normalizedDates.length) throw new BadRequestException('Please select at least one valid visibility date');

    const today = new Date(); today.setHours(0,0,0,0);
    if (normalizedDates[0] < today) throw new BadRequestException('Selected dates cannot be in the past');

    const selectedDays = normalizedDates.length;
    const dailyRate = Number(payload.dailyRate ?? 240);
    const platformFee = Number(payload.platformFee ?? (selectedDays > 0 ? 49 : 0));
    const computedTotal = dailyRate * selectedDays + platformFee;

    const request = await this.offerModel.create({
      requestId: uuidv4(),
      merchantId,
      merchantName: merchant.name || 'Merchant',
      merchantEmail: merchant.email || '-',
      title: (payload.title || '').trim(),
      category: (payload.category || '').trim(),
      description: payload.description || '',
      imageUrl: payload.imageUrl,
      recommendedSize: payload.recommendedSize || '1920 x 520 px',
      selectedDates: normalizedDates,
      startDate: normalizedDates[0],
      endDate: normalizedDates[normalizedDates.length - 1],
      selectedDays,
      dailyRate,
      platformFee,
      totalPrice: Number(payload.totalPrice || computedTotal),
      loyaltyRewardEnabled: Boolean(payload.loyaltyRewardEnabled),
      loyaltyStarsToOffer: Number(payload.loyaltyStarsToOffer || 0),
      loyaltyStarsPerPurchase: Number(payload.loyaltyStarsPerPurchase || 1),
      loyaltyScorePerStar: Number(payload.loyaltyScorePerStar || 10),
        loyaltyPointsPerPurchase: Number(payload.loyaltyPointsPerPurchase || 0), // New field
      promotionExpiryText: payload.promotionExpiryText || '',
      termsAndConditions: payload.termsAndConditions || '',
      exampleUsage: payload.exampleUsage || '',
      selectedProducts: Array.isArray(payload.selectedProducts) ? payload.selectedProducts : [],
      status: OfferPromotionStatus.UNDER_REVIEW,
      paymentStatus: OfferPaymentStatus.PENDING,
      isActive: false,
    });

    if (this.kafkaService) {
      try {
        await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_SUBMITTED, {
          requestId: request.requestId,
          merchantId,
          title: request.title,
          category: request.category,
          totalPrice: request.totalPrice,
        });
      } catch (err) {
        this.logger.warn('Kafka emit failed for offer submission');
      }
    }

    await this.redisService.deleteByPattern(`golo:offers:merchant:${merchantId}:*`);
    return request;
  } catch (error) {
    const err = error as any;

    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      throw new BadRequestException(err?.message || 'Invalid offer payload');
    }

    if (err?.code === 11000) {
      this.logger.warn(`[submitOfferPromotionRequest] E11000 Duplicate Key Error: ${err.message}`);
      throw new BadRequestException('Failed to create offer. Please try again.');
    }

    this.logger.error(`[submitOfferPromotionRequest] Error: ${err?.message || 'unknown error'}`, err?.stack);
    throw error;
  }
  }

  async listMerchantOffers(merchantId: string) {
    const rows = await this.offerModel.find({ merchantId }).sort({ createdAt: -1 }).lean().exec();

    if (!rows.length) {
      return rows;
    }

    const offerIds = rows.map((row) => row._id);

    const pendingVouchers = await this.voucherModel
      .find({
        offerId: { $in: offerIds },
        status: { $in: [VoucherStatus.ACTIVE, VoucherStatus.CLAIMED] },
      })
      .select('offerId userId claimedAt')
      .sort({ claimedAt: -1 })
      .lean()
      .exec();

    const latestPendingVoucherByOfferId = new Map<string, { userId: any; claimedAt?: Date }>();
    for (const voucher of pendingVouchers) {
      const offerId = String(voucher.offerId);
      if (!latestPendingVoucherByOfferId.has(offerId)) {
        latestPendingVoucherByOfferId.set(offerId, {
          userId: voucher.userId,
          claimedAt: voucher.claimedAt,
        });
      }
    }

    const userIds = Array.from(
      new Set(
        Array.from(latestPendingVoucherByOfferId.values())
          .map((item) => String(item.userId || ''))
          .filter(Boolean),
      ),
    );

    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds } })
          .select('profile.phone')
          .lean()
          .exec()
      : [];

    const userPhoneById = new Map<string, string>();
    for (const user of users) {
      const phone = String((user as any)?.profile?.phone || '').trim();
      if (phone) {
        userPhoneById.set(String((user as any)._id), phone);
      }
    }

    return rows.map((row) => {
      const latestPending = latestPendingVoucherByOfferId.get(String(row._id));
      const pendingCustomerContact = latestPending
        ? userPhoneById.get(String(latestPending.userId)) || null
        : null;

      return {
        ...row,
        pendingCustomerContact,
        pendingClaimedAt: latestPending?.claimedAt || null,
      };
    });
  }

  async updateMerchantOffer(requestId: string, merchantId: string, payload: any) {
    const request = await this.offerModel.findOne({ requestId, merchantId }).exec();
    if (!request) throw new NotFoundException('Offer not found');

    if (payload.title !== undefined) request.title = String(payload.title).trim();
    if (payload.category !== undefined) request.category = String(payload.category).trim();
    if (payload.imageUrl !== undefined) request.imageUrl = payload.imageUrl;
    if (Array.isArray(payload.selectedDates) && payload.selectedDates.length) {
      const normalized = this.normalizeDateStrings(payload.selectedDates);
      if (!normalized.length) throw new BadRequestException('Please provide valid selectedDates');
      request.selectedDates = normalized;
      request.startDate = normalized[0];
      request.endDate = normalized[normalized.length - 1];
      request.selectedDays = normalized.length;
      request.totalPrice = request.dailyRate * request.selectedDays + request.platformFee;
    }

    if (payload.action === 'pause') {
      request.isActive = false;
      if (request.status === OfferPromotionStatus.ACTIVE) request.status = OfferPromotionStatus.APPROVED;
    }

    if (payload.action === 'resume') {
      if (request.paymentStatus !== OfferPaymentStatus.PAID) throw new BadRequestException('Only paid offers can be resumed');
      request.isActive = true;
      request.status = OfferPromotionStatus.ACTIVE;
    }

    await request.save();
    await this.redisService.deleteByPattern(this.offerMerchantCacheKey(merchantId));
    return request;
  }

  async deleteMerchantOffer(requestId: string, merchantId: string) {
    const offer = await this.offerModel.findOne({ requestId, merchantId }).exec();
    if (!offer) throw new NotFoundException('Offer not found');
    await this.offerModel.deleteOne({ requestId, merchantId }).exec();
    if (this.kafkaService) {
      try { await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_DELETED, { requestId, merchantId }); } catch {}
    }
    await this.redisService.deleteByPattern(this.offerMerchantCacheKey(merchantId));
    return offer;
  }

  async getPublicOfferDetails(offerId: string) {
    let row: any = null;

    // Try MongoDB _id first
    if (isValidObjectId(offerId)) {
      row = await this.offerModel.findOne({ _id: offerId }).lean().exec();
    }

    // Fallback: try requestId
    if (!row) {
      row = await this.offerModel.findOne({ requestId: offerId }).lean().exec();
    }

    if (!row) throw new NotFoundException('Offer not found');

    const detailEndsAt = row.endDate || (Array.isArray(row.selectedDates) ? row.selectedDates[row.selectedDates.length - 1] : null) || null;
    if (this.isExpiredDate(detailEndsAt) || row.status === OfferPromotionStatus.EXPIRED) {
      throw new NotFoundException('Offer not found');
    }

    const merchant = await this.merchantModel
      .findOne({ userId: String(row.merchantId) })
      .select('userId storeName storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto storeCategory storeSubCategory')
      .lean()
      .exec();

    const rowAny: any = row;
    const selectedProducts: any[] = Array.isArray(rowAny.selectedProducts) ? rowAny.selectedProducts : [];

    const computedBestDiscountPercent = selectedProducts.reduce((best, product) => {
      const original = Number(product?.originalPrice || 0);
      const offerPrice = Number(product?.offerPrice || 0);
      if (original <= 0 || offerPrice < 0 || offerPrice >= original) return best;
      const discountPercent = ((original - offerPrice) / original) * 100;
      return Math.max(best, discountPercent);
    }, 0);

    const lowestOfferPrice = selectedProducts.length
      ? selectedProducts.reduce((min, product) => {
          const value = Number(product?.offerPrice || 0);
          return value > 0 ? Math.min(min, value) : min;
        }, Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;

    const startsAt = row.startDate || row.selectedDates?.[0] || null;
    const endsAt = detailEndsAt;

    const normalized = {
      offerId: String(row._id),
      requestId: row.requestId,
      title: rowAny.title || '',
      category: rowAny.category || '',
      imageUrl: rowAny.imageUrl || '',
      totalPrice: Number(row.totalPrice || 0),
      displayPrice: lowestOfferPrice !== Number.MAX_SAFE_INTEGER ? lowestOfferPrice : Number(row.totalPrice || 0),
      discountPercent: Math.round(computedBestDiscountPercent),
      startsAt,
      endsAt,
      status: row.status,
      isActiveNow: Boolean(startsAt && endsAt) && new Date(startsAt) <= new Date() && new Date(endsAt) >= new Date(),
      merchant: {
        merchantId: String(row.merchantId),
        name: merchant?.storeName || row.merchantName || 'Merchant',
        category: merchant?.storeCategory || '',
        subCategory: merchant?.storeSubCategory || '',
        address: merchant?.storeLocation || '',
        latitude: merchant?.storeLocationLatitude || null,
        longitude: merchant?.storeLocationLongitude || null,
        profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
      },
      selectedProducts,
      createdAt: rowAny.createdAt,
      description: rowAny.description || rowAny.promotionExpiryText || '',
      exampleUsage: rowAny.exampleUsage || '',
      termsAndConditions: rowAny.termsAndConditions || '',
    };

    return normalized;
  }

  // Template helpers using Redis
  async saveOfferTemplate(merchantId: string, payload: any) {
    const normalized = { formData: payload.formData || {}, selectedProducts: Array.isArray(payload.selectedProducts) ? payload.selectedProducts : [], updatedAt: new Date().toISOString() };
    const updated = await this.merchantModel.findOneAndUpdate(
      { userId: merchantId },
      { $set: { offerTemplate: normalized, updatedAt: new Date() } },
      { new: true },
    ).lean().exec();
    if (!updated) throw new BadRequestException('Failed to save template');
    return normalized;
  }

  async getOfferTemplate(merchantId: string) {
    const merchant = await this.merchantModel.findOne({ userId: merchantId }).select('offerTemplate').lean().exec();
    return merchant?.offerTemplate || null;
  }

  async clearOfferTemplate(merchantId: string) {
    const updated = await this.merchantModel.findOneAndUpdate({ userId: merchantId }, { $set: { offerTemplate: null, updatedAt: new Date() } }, { new: true }).lean().exec();
    if (!updated) throw new BadRequestException('Failed to clear template');
    return { cleared: true };
  }

  async getNearbyOffers(params: {
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    location?: string;
    query?: string;
    category?: string;
    sort?: string;
    maxPrice?: number;
    page?: number;
    limit?: number;
  }) {
    const safePage = Math.max(1, Number(params.page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    // IMPORTANT: do not prefetch too few rows before applying geo/location filtering,
    // otherwise results look "random" (sometimes none / sometimes a few) depending on which
    // subset was fetched. When the user is searching nearby or by location, we need a larger,
    // deterministic sample.
    const hasAnyFilter =
      Boolean(String(params.location || '').trim()) ||
      (typeof params.latitude === 'number' &&
        !Number.isNaN(params.latitude) &&
        typeof params.longitude === 'number' &&
        !Number.isNaN(params.longitude)) ||
      Boolean(String(params.query || '').trim()) ||
      Boolean(String(params.category || '').trim());

    const prefetchLimit = hasAnyFilter ? 5000 : Math.min(300, Math.max(120, safeLimit * 8));
    const safeRadiusKm = Math.min(100, Math.max(1, Number(params.radiusKm) || 5));
    const locationNeedle = String(params.location || '').trim().toLowerCase();
    const queryNeedle = String(params.query || '').trim().toLowerCase();
    const categoryNeedle = String(params.category || '').trim().toLowerCase();
    const sortBy = String(params.sort || '').trim().toLowerCase();
    const maxPrice = Number(params.maxPrice);

    const hasUserCoordinates =
      typeof params.latitude === 'number' &&
      !Number.isNaN(params.latitude) &&
      typeof params.longitude === 'number' &&
      !Number.isNaN(params.longitude);

    const now = new Date();

    let offerRows: any[] = [];
    try {
      offerRows = await this.offerModel
        .find({
          status: { $in: ['under_review', 'approved', 'active'] },
          $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }],
        })
        .select('requestId merchantId merchantName title category totalPrice startDate endDate status createdAt imageUrl selectedProducts')
        .sort({ createdAt: -1 })
        .limit(prefetchLimit)
        .maxTimeMS(12000)
        .lean()
        .exec();
    } catch (error: any) {
      this.logger.error(`Nearby offers query failed: ${error?.message || error}`);
      return {
        data: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          pages: 0,
        },
      };
    }

    if (!offerRows.length) {
      return {
        data: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          pages: 0,
        },
      };
    }

    const merchantIds = Array.from(new Set(offerRows.map((row) => String(row.merchantId))));
    let merchants: any[] = [];
    try {
      merchants = await this.merchantModel
        .find({ userId: { $in: merchantIds } })
        .select('userId storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto')
        .maxTimeMS(8000)
        .lean()
        .exec();
    } catch (error: any) {
      this.logger.error(`Nearby merchants query failed: ${error?.message || error}`);
      merchants = [];
    }

    const merchantsByUserId = new Map<string, any>(merchants.map((m) => [String(m.userId), m]));

    // Location matching should work even when the city/state/pincode are stored on the user profile
    // (common for older merchant profiles). Keep this logic local to offers-service (no banners dependency).
    let usersById = new Map<string, any>();
    try {
      const users = await this.userModel
        .find({ _id: { $in: merchantIds } })
        .select('profile.city profile.state profile.pincode name email')
        .maxTimeMS(8000)
        .lean()
        .exec();

      usersById = new Map<string, any>(users.map((user) => [String(user._id), user]));
    } catch (error: any) {
      this.logger.error(`Nearby users query failed: ${error?.message || error}`);
      usersById = new Map<string, any>();
    }

    const buildLocationText = (merchant?: any, user?: any) => {
      return [
        merchant?.storeLocation,
        user?.profile?.city,
        user?.profile?.state,
        user?.profile?.pincode,
      ]
        .filter(Boolean)
        .map((part) => String(part).trim())
        .join(', ')
        .toLowerCase();
    };

    const normalizeLocationNeedle = (value: string) => {
      const raw = String(value || '').toLowerCase();
      // Keep unicode letters/numbers (supports Marathi/Hindi, etc.), only collapse separators.
      return raw
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Lightweight alias support so users don't need to type the exact address string.
    // Example: merchants may store "Karvir/Karveer" while users search "Kolhapur".
    const LOCATION_ALIASES: Record<string, string[]> = {
      kolhapur: ['kolhapur', 'karvir', 'karveer', 'karveer taluka', 'karvir taluka'],
    };

    const matchesLocationQuery = (locationQueryRaw: string, locationBlobRaw: string) => {
      const locationBlobRawLower = String(locationBlobRaw || '').toLowerCase();
      const locationQueryRawLower = String(locationQueryRaw || '').toLowerCase();
      const locationBlob = normalizeLocationNeedle(locationBlobRawLower);
      const locationQuery = normalizeLocationNeedle(locationQueryRawLower);
      if (!locationQuery) return true;
      if (!locationBlobRawLower && !locationBlob) return false;

      // Prefer matching the city (first comma-separated segment) to avoid
      // matches driven only by state/country tokens like "Maharashtra".
      const citySegment = String(locationQueryRawLower).split(',')[0].trim();
      const cityNorm = normalizeLocationNeedle(citySegment);
      if (cityNorm && locationBlob.includes(cityNorm)) return true;

      // Full substring match as fallback
      if (locationBlobRawLower.includes(locationQueryRawLower)) return true;
      if (locationBlob.includes(locationQuery)) return true;

      const cityTokens = cityNorm ? [cityNorm] : [];
      for (const token of cityTokens) {
        if (token && locationBlob.includes(token)) return true;
        const aliases = LOCATION_ALIASES[token];
        if (aliases && aliases.length) {
          for (const alias of aliases) {
            const normalizedAlias = normalizeLocationNeedle(alias);
            if (normalizedAlias && locationBlob.includes(normalizedAlias)) return true;
          }
        }
      }

      return false;
    };

    if (!hasUserCoordinates && !locationNeedle) {
      let normalized = offerRows.map((row) => {
        const merchant = merchantsByUserId.get(String(row.merchantId));
        return {
          offerId: String(row._id),
          requestId: row.requestId,
          title: row.title,
          category: row.category,
          imageUrl: row.imageUrl || '',
          totalPrice: Number(row.totalPrice || 0),
          displayPrice: Number(row.totalPrice || 0),
          discountPercent: 0,
          startsAt: row.startDate,
          endsAt: row.endDate,
          status: row.status,
          isActiveNow: false,
          distanceKm: null,
          merchant: {
            merchantId: String(row.merchantId),
            name: merchant?.storeName || row.merchantName || 'Merchant',
            category: merchant?.storeCategory || '',
            subCategory: merchant?.storeSubCategory || '',
            address: merchant?.storeLocation || '',
            latitude: merchant?.storeLocationLatitude || null,
            longitude: merchant?.storeLocationLongitude || null,
            profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
          },
          selectedProducts: Array.isArray(row.selectedProducts) ? row.selectedProducts : [],
          createdAt: row.createdAt,
        };
      });

      if (queryNeedle) {
        normalized = normalized.filter((row) => {
          const blob = `${row.title || ''} ${row.category || ''} ${row.merchant.name || ''}`.toLowerCase();
          return blob.includes(queryNeedle);
        });
      }

      if (categoryNeedle) {
        normalized = normalized.filter((row) => String(row.category || '').toLowerCase() === categoryNeedle);
      }

      if (!Number.isNaN(maxPrice) && maxPrice > 0) {
        normalized = normalized.filter((row) => row.displayPrice <= maxPrice);
      }

      normalized.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const total = normalized.length;
      const pages = Math.ceil(total / safeLimit);
      const start = (safePage - 1) * safeLimit;

      return {
        data: normalized.slice(start, start + safeLimit),
        pagination: { page: safePage, limit: safeLimit, total, pages },
      };
    }

    let normalized = offerRows.map((row) => {
      const merchant = merchantsByUserId.get(String(row.merchantId));
      const latitude = Number(merchant?.storeLocationLatitude);
      const longitude = Number(merchant?.storeLocationLongitude);
      const hasMerchantCoordinates = this.hasValidMerchantCoordinates(latitude, longitude);

      let distanceKm: number | null = null;
      if (hasUserCoordinates && hasMerchantCoordinates) {
        distanceKm = this.calculateDistanceKm(Number(params.latitude), Number(params.longitude), latitude, longitude);
      }

      const selectedProducts: any[] = Array.isArray(row.selectedProducts) ? row.selectedProducts : [];

      const computedBestDiscountPercent = selectedProducts.reduce((best, product) => {
        const original = Number(product?.originalPrice || 0);
        const offer = Number(product?.offerPrice || 0);
        if (original <= 0 || offer < 0 || offer >= original) return best;
        const discountPercent = ((original - offer) / original) * 100;
        return Math.max(best, discountPercent);
      }, 0);

      const lowestOfferPrice = selectedProducts.length
        ? selectedProducts.reduce((min, product) => {
            const value = Number(product?.offerPrice || 0);
            return value > 0 ? Math.min(min, value) : min;
          }, Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      const startsAt = row.startDate ? new Date(row.startDate) : null;
      const endsAt = row.endDate ? new Date(row.endDate) : null;
      const isActiveNow = Boolean(startsAt && endsAt) && startsAt <= now && endsAt >= now;

      return {
        offerId: String(row._id),
        requestId: row.requestId,
        title: row.title,
        category: row.category,
        imageUrl: row.imageUrl || '',
        totalPrice: Number(row.totalPrice || 0),
        displayPrice: lowestOfferPrice !== Number.MAX_SAFE_INTEGER ? lowestOfferPrice : Number(row.totalPrice || 0),
        discountPercent: Math.round(computedBestDiscountPercent),
        startsAt: row.startDate,
        endsAt: row.endDate,
        status: row.status,
        isActiveNow,
        distanceKm,
        merchant: {
          merchantId: String(row.merchantId),
          name: merchant?.storeName || row.merchantName || 'Merchant',
          category: merchant?.storeCategory || '',
          subCategory: merchant?.storeSubCategory || '',
          address: merchant?.storeLocation || '',
          latitude: hasMerchantCoordinates ? latitude : null,
          longitude: hasMerchantCoordinates ? longitude : null,
          profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
        },
        selectedProducts,
        createdAt: row.createdAt,
      };
    });

    if (hasUserCoordinates) {
      normalized = normalized.filter((row) => {
        // If user explicitly searched for a location (e.g. "Pune"), do not mix in radius results
        // from the current GPS location. Only show rows matching the location text.
        if (locationNeedle) {
          const merchantKey = String(row?.merchant?.merchantId || '');
          const merchant = merchantKey ? merchantsByUserId.get(merchantKey) : undefined;
          const user = merchantKey ? usersById.get(merchantKey) : undefined;
          return matchesLocationQuery(locationNeedle, buildLocationText(merchant, user));
        }

        if (row.distanceKm === null) {
          return true;
        }

        return row.distanceKm <= safeRadiusKm;
      });
    } else if (locationNeedle) {
      normalized = normalized.filter((row) => {
        const merchantKey = String(row?.merchant?.merchantId || '');
        const merchant = merchantKey ? merchantsByUserId.get(merchantKey) : undefined;
        const user = merchantKey ? usersById.get(merchantKey) : undefined;
        return matchesLocationQuery(locationNeedle, buildLocationText(merchant, user));
      });
    }

    if (queryNeedle) {
      normalized = normalized.filter((row) => {
        const searchBlob = [row.title, row.category, row.merchant.name, row.merchant.address].filter(Boolean).join(' ').toLowerCase();
        return searchBlob.includes(queryNeedle);
      });
    }

    if (categoryNeedle) {
      normalized = normalized.filter((row) => String(row.category || '').toLowerCase() === categoryNeedle);
    }

    if (!Number.isNaN(maxPrice) && maxPrice > 0) {
      normalized = normalized.filter((row) => {
        const hasProductPrices = Array.isArray(row.selectedProducts) && row.selectedProducts.length > 0;
        if (!hasProductPrices) return true;
        return row.displayPrice <= maxPrice;
      });
    }

    if (sortBy === 'price_asc') {
      normalized.sort((a, b) => a.displayPrice - b.displayPrice);
    } else if (sortBy === 'price_desc') {
      normalized.sort((a, b) => b.displayPrice - a.displayPrice);
    } else if (sortBy === 'newest') {
      normalized.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else if (hasUserCoordinates) {
      normalized.sort((a, b) => {
        const distanceA = a.distanceKm ?? Number.MAX_SAFE_INTEGER;
        const distanceB = b.distanceKm ?? Number.MAX_SAFE_INTEGER;
        return distanceA - distanceB;
      });
    } else {
      normalized.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }

    const total = normalized.length;
    const pages = Math.ceil(total / safeLimit);
    const start = (safePage - 1) * safeLimit;
    const data = normalized.slice(start, start + safeLimit);

    return { data, pagination: { page: safePage, limit: safeLimit, total, pages } };
  }
}

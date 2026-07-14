import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka/kafka.service';
import { RedisService } from '../common/services/redis.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationSecurityService } from '../security/moderation/moderation-security.service';
import * as crypto from 'crypto';
import { OfferPromotion, OfferPromotionDocument, OfferPromotionStatus, OfferPaymentStatus } from './schemas/offer-promotion.schema';
import { Voucher, VoucherDocument, VoucherStatus } from '../vouchers/schemas/voucher.schema';
// Banner models removed to keep offers module independent from banners
import { User, UserDocument } from '../users/schemas/user.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import {
  MerchantProduct,
  MerchantProductDocument,
} from '../merchant-products/schemas/merchant-product.schema';
import { Follow, FollowDocument } from '../users/schemas/follow.schema';
import { Notification, NotificationDocument } from '../users/schemas/notification.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { TransactionService } from '../common/services/transaction.service';

@Injectable()
export class OffersService implements OnModuleInit {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @InjectModel(OfferPromotion.name)
    private readonly offerModel: Model<OfferPromotionDocument>,
    @InjectModel(Voucher.name)
    private readonly voucherModel: Model<VoucherDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(Follow.name) private readonly followModel: Model<FollowDocument>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    private readonly SubscriptionsService: SubscriptionsService,
    private readonly redisService: RedisService,
    private readonly transactionService: TransactionService,
    private readonly moderationService: ModerationService,
    private readonly moderationSecurityService: ModerationSecurityService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private offerMerchantCacheKey(merchantId: string) {
    return `golo:offers:merchant:${merchantId}`;
  }

  private offerTemplateCacheKey(merchantId: string) {
    return `golo:offers:template:${merchantId}`;
  }

  private getISTDateParts(value: Date | string | number): {
    year: number;
    month: number;
    date: number;
  } {
    const dateObj = new Date(value);
    if (isNaN(dateObj.getTime())) return { year: 1970, month: 0, date: 1 };
    // IST is UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const shifted = new Date(dateObj.getTime() + istOffset);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      date: shifted.getUTCDate(),
    };
  }

  private getStartOfTodayIST(): Date {
    const parts = this.getISTDateParts(Date.now());
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(Date.UTC(parts.year, parts.month, parts.date) - istOffset);
  }

  private isExpiredDate(value?: Date | string | null): boolean {
    if (!value) return false;
    // The date is stored as 00:00:00 local time, so it expires at the END of that day
    const expiresAt = new Date(value).getTime() + 86400000;
    return Number.isFinite(expiresAt) && expiresAt < Date.now();
  }

  private getCalendarDateKey(value: Date | string | null | undefined): string {
    if (!value) return '';
    const parts = this.getISTDateParts(value);
    if (parts.year === 1970) return '';
    const month = String(parts.month + 1).padStart(2, '0');
    const day = String(parts.date).padStart(2, '0');
    return `${parts.year}-${month}-${day}`;
  }

  private isSelectedForDate(offer: any, date = new Date()): boolean {
    const targetKey = this.getCalendarDateKey(date);
    const selectedDates = Array.isArray(offer?.selectedDates)
      ? offer.selectedDates
      : [];

    if (selectedDates.length > 0) {
      return selectedDates.some(
        (selectedDate) => this.getCalendarDateKey(selectedDate) === targetKey,
      );
    }

    const startKey = this.getCalendarDateKey(offer?.startDate);
    const endKey = this.getCalendarDateKey(offer?.endDate);
    return Boolean(
      startKey && endKey && startKey <= targetKey && targetKey <= endKey,
    );
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

  private hasValidMerchantCoordinates(
    latitude: number,
    longitude: number,
  ): boolean {
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

    const istOffset = 5.5 * 60 * 60 * 1000;

    // Parse YYYY-MM-DD format and convert to 00:00:00 IST
    const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
    if (dateOnlyMatch) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day) - istOffset);
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    // For arbitrary date strings, convert them into IST parts and use that day's 00:00 IST
    const parts = this.getISTDateParts(parsed);
    return new Date(Date.UTC(parts.year, parts.month, parts.date) - istOffset);
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
    console.log('--> OFFERS SERVICE onModuleInit START');
    try {
      const indexes = await this.offerModel.collection.indexes();
      console.log('--> OFFERS SERVICE indexes DONE');
      const staleIdempotencyIndexes = indexes.filter((idx: any) => {
        const keys = Object.keys(idx?.key || {});
        return keys.includes('idempotencyKey');
      });

      for (const indexDef of staleIdempotencyIndexes) {
        const indexName = indexDef?.name;
        if (!indexName) continue;
        await this.offerModel.collection.dropIndex(indexName);
        this.logger.warn(
          `[Offers] Dropped legacy index on startup: ${indexName}`,
        );
      }
    } catch (error) {
      const err = error;
      this.logger.warn(
        `[Offers] Index cleanup skipped: ${err?.message || 'unknown error'}`,
      );
    }
  }

  async submitOfferPromotionRequest(merchantId: string, payload: any) {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new BadRequestException('Invalid offer payload');
      }

      this.logger.log(
        `[submitOfferPromotionRequest] merchantId=${merchantId}, payload keys=${Object.keys(payload || {}).join(',')}`,
      );

      const merchant = await this.userModel
        .findById(merchantId)
        .select('name email role accountType')
        .lean()
        .exec();
      if (!merchant) {
        this.logger.error(
          `[submitOfferPromotionRequest] Merchant not found: ${merchantId}`,
        );
        throw new NotFoundException('Merchant not found');
      }
      this.logger.log(
        `[submitOfferPromotionRequest] Merchant found: ${merchant.name}, role=${merchant.role}, accountType=${merchant.accountType}`,
      );

      if (merchant.role !== 'merchant' && merchant.accountType !== 'merchant') {
        throw new BadRequestException('Only merchants can submit offers');
      }

      const merchantProfile = await this.merchantModel
        .findOne({ userId: merchantId })
        .select('storeLocationLatitude storeLocationLongitude')
        .lean()
        .exec();
      this.logger.log(
        `[submitOfferPromotionRequest] Merchant profile: ${JSON.stringify(merchantProfile)}`,
      );

      const latitude = Number(merchantProfile?.storeLocationLatitude);
      const longitude = Number(merchantProfile?.storeLocationLongitude);
      const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
      if (!hasCoords)
        throw new BadRequestException(
          'Store coordinates missing. Set store location before publishing offers.',
        );

      const normalizedDates = Array.isArray(payload.selectedDates)
        ? this.normalizeDateStrings(payload.selectedDates)
        : [];
      if (!normalizedDates.length)
        throw new BadRequestException(
          'Please select at least one valid visibility date',
        );

      const today = this.getStartOfTodayIST();
      if (normalizedDates[0] < today)
        throw new BadRequestException('Selected dates cannot be in the past');

      const selectedDays = normalizedDates.length;

      if (payload.imageUrl && this.moderationService) {
        await this.moderationSecurityService.checkRestriction(merchantId);
        const isSafe = await this.moderationService.isImageSafe(payload.imageUrl);
        if (!isSafe) {
          const imageHash = crypto.createHash('sha256').update(payload.imageUrl).digest('hex');
          await this.moderationSecurityService.handleFailure(merchantId, 'new_offer', imageHash, 'INAPPROPRIATE_CONTENT');
          throw new BadRequestException('One or more images contain inappropriate content and cannot be uploaded.');
        } else {
          await this.moderationSecurityService.handleSuccess(merchantId, 'new_offer');
        }
      }

      // Free Tier Validation
      const merchantDoc = await this.merchantModel
        .findOne({ userId: merchantId })
        .exec();
      if (merchantDoc) {
        const planDetails =
          await this.SubscriptionsService.getPlanDetails(merchantDoc);
        const features = planDetails.planFeatures;

        // 1. Product Eligibility Validation
        if (
          features.maxProducts !== -1 &&
          Array.isArray(payload.selectedProducts) &&
          payload.selectedProducts.length > 0
        ) {
          const topProducts = await this.merchantProductModel
            .find({ merchantId })
            .sort({ createdAt: -1 })
            .limit(features.maxProducts)
            .select('_id')
            .lean()
            .exec();

          const eligibleProductIds = new Set(
            topProducts.map((p) => String(p._id)),
          );
          const invalidProducts = payload.selectedProducts.filter(
            (p) => !eligibleProductIds.has(String(p.productId)),
          );

          if (invalidProducts.length > 0) {
            throw new BadRequestException({
              success: false,
              statusCode: 400,
              errorCode: 'PRODUCT_NOT_ELIGIBLE',
              message:
                `Offers can only be created on your ${features.maxProducts} most recently added products.`,
            });
          }
        }

        // 2. Monthly Limit Validation
        const parts = this.getISTDateParts(Date.now());
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const startOfMonth = new Date(
          Date.UTC(parts.year, parts.month, 1) - istOffsetMs,
        );

        const offersThisMonth = await this.offerModel.countDocuments({
          merchantId,
          createdAt: { $gte: startOfMonth },
        });

        // Note: use maxMonthlyOffers instead of monthlyOffersLimit
        const monthlyLimit =
          features.maxMonthlyOffers === -1
            ? Infinity
            : features.maxMonthlyOffers;
        if (offersThisMonth >= monthlyLimit) {
          throw new BadRequestException({
            success: false,
            statusCode: 400,
            errorCode: 'MONTHLY_OFFER_LIMIT_REACHED',
            message: `You have reached your monthly limit of ${monthlyLimit} offers. Please upgrade to Premium.`,
          });
        }

        // 3. Duration Validation
        const maxDuration =
          features.maxOfferDurationDays === -1
            ? Infinity
            : features.maxOfferDurationDays;
        if (selectedDays > maxDuration) {
          throw new BadRequestException({
            success: false,
            statusCode: 400,
            errorCode: 'OFFER_DURATION_EXCEEDED',
            message: `Your current plan limits offer duration to ${maxDuration} days.`,
          });
        }
      }

      const dailyRate = Number(payload.dailyRate ?? 240);
      const platformFee = Number(
        payload.platformFee ?? (selectedDays > 0 ? 49 : 0),
      );
      const computedTotal = dailyRate * selectedDays + platformFee;

      const request = await this.transactionService.execute(async (session) => {
        const created = await this.offerModel.create(
          [
            {
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
              loyaltyStarsPerPurchase: Number(
                payload.loyaltyStarsPerPurchase || 1,
              ),
              loyaltyScorePerStar: Number(payload.loyaltyScorePerStar || 10),
              loyaltyPointsPerPurchase: Number(
                payload.loyaltyPointsPerPurchase || 0,
              ),
              promotionExpiryText: payload.promotionExpiryText || '',
              termsAndConditions: payload.termsAndConditions || '',
              exampleUsage: payload.exampleUsage || '',
              selectedProducts: Array.isArray(payload.selectedProducts)
                ? payload.selectedProducts
                : [],
              status: OfferPromotionStatus.UNDER_REVIEW,
              paymentStatus: OfferPaymentStatus.PENDING,
              isActive: false,
            },
          ],
          { session },
        );
        return created[0];
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

      await this.redisService.deleteByPattern(
        `golo:offers:merchant:${merchantId}:*`,
      );
      return request;
    } catch (error) {
      const err = error;

      if (err?.name === 'ValidationError' || err?.name === 'CastError') {
        throw new BadRequestException(err?.message || 'Invalid offer payload');
      }

      if (err?.code === 11000) {
        this.logger.warn(
          `[submitOfferPromotionRequest] E11000 Duplicate Key Error: ${err.message}`,
        );
        throw new BadRequestException(
          'Failed to create offer. Please try again.',
        );
      }

      this.logger.error(
        `[submitOfferPromotionRequest] Error: ${err?.message || 'unknown error'}`,
        err?.stack,
      );
      throw error;
    }
  }

  async listMerchantOffers(merchantId: string) {
    const rows = await this.offerModel
      .find({ merchantId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

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

    const latestPendingVoucherByOfferId = new Map<
      string,
      { userId: any; claimedAt?: Date }
    >();
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

  async updateMerchantOffer(
    requestId: string,
    merchantId: string,
    payload: any,
  ) {
    const merchantDoc = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (merchantDoc) {
      const planDetails =
        await this.SubscriptionsService.getPlanDetails(merchantDoc);
      if (!planDetails.planFeatures.canEditOffer) {
        throw new ForbiddenException(
          'Free Tier merchants cannot edit offers. Please upgrade to Premium.',
        );
      }
    }

    const request = await this.offerModel
      .findOne({ requestId, merchantId })
      .exec();
    if (!request) throw new NotFoundException('Offer not found');
    if (payload.title !== undefined) request.title = String(payload.title).trim();
    if (payload.category !== undefined) request.category = String(payload.category).trim();
    if (payload.imageUrl !== undefined) {
      if (payload.imageUrl && this.moderationService) {
        await this.moderationSecurityService.checkRestriction(merchantId, request._id.toString());
        const isSafe = await this.moderationService.isImageSafe(payload.imageUrl);
        if (!isSafe) {
          const imageHash = crypto.createHash('sha256').update(payload.imageUrl).digest('hex');
          await this.moderationSecurityService.handleFailure(merchantId, request._id.toString(), imageHash, 'INAPPROPRIATE_CONTENT');
          throw new BadRequestException('One or more images contain inappropriate content and cannot be uploaded.');
        } else {
          await this.moderationSecurityService.handleSuccess(merchantId, request._id.toString());
        }
      }
      request.imageUrl = payload.imageUrl;
    }
    if (payload.description !== undefined) request.description = payload.description;
    if (payload.recommendedSize !== undefined) request.recommendedSize = payload.recommendedSize;
    if (payload.totalPrice !== undefined) request.totalPrice = Number(payload.totalPrice || 0);
    if (payload.promotionExpiryText !== undefined) request.promotionExpiryText = payload.promotionExpiryText;
    if (payload.termsAndConditions !== undefined) request.termsAndConditions = payload.termsAndConditions;
    if (payload.exampleUsage !== undefined) request.exampleUsage = payload.exampleUsage;
    if (payload.loyaltyRewardEnabled !== undefined) request.loyaltyRewardEnabled = Boolean(payload.loyaltyRewardEnabled);
    if (payload.loyaltyPointsPerPurchase !== undefined) request.loyaltyPointsPerPurchase = Number(payload.loyaltyPointsPerPurchase || 0);
    if (payload.loyaltyStarsToOffer !== undefined) request.loyaltyStarsToOffer = Number(payload.loyaltyStarsToOffer || 0);
    if (payload.loyaltyStarsPerPurchase !== undefined) request.loyaltyStarsPerPurchase = Number(payload.loyaltyStarsPerPurchase || 1);
    if (payload.loyaltyScorePerStar !== undefined) request.loyaltyScorePerStar = Number(payload.loyaltyScorePerStar || 10);
    if (Array.isArray(payload.selectedProducts)) request.selectedProducts = payload.selectedProducts;
    if (Array.isArray(payload.selectedDates) && payload.selectedDates.length) {
      const normalized = this.normalizeDateStrings(payload.selectedDates);
      if (!normalized.length)
        throw new BadRequestException('Please provide valid selectedDates');
      request.selectedDates = normalized;
      request.startDate = normalized[0];
      request.endDate = normalized[normalized.length - 1];
      request.selectedDays = normalized.length;
      request.totalPrice =
        request.dailyRate * request.selectedDays + request.platformFee;
    }

    if (payload.action === 'pause') {
      request.isActive = false;
      if (request.status === OfferPromotionStatus.ACTIVE)
        request.status = OfferPromotionStatus.APPROVED;
    }

    if (payload.action === 'resume') {
      if (request.paymentStatus !== OfferPaymentStatus.PAID)
        throw new BadRequestException('Only paid offers can be resumed');
      request.isActive = true;
      request.status = OfferPromotionStatus.ACTIVE;
    }

    await this.transactionService.execute(async (session) => {
      await request.save({ session });
    });
    await this.redisService.deleteByPattern(
      this.offerMerchantCacheKey(merchantId),
    );
    return request;
  }

  async deleteMerchantOffer(requestId: string, merchantId: string) {
    const merchantDoc = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (merchantDoc) {
      const planDetails =
        await this.SubscriptionsService.getPlanDetails(merchantDoc);
      if (!planDetails.planFeatures.canDeleteOffer) {
        throw new ForbiddenException(
          'Free Tier merchants cannot delete offers. Please upgrade to Premium.',
        );
      }
    }

    const offer = await this.offerModel
      .findOne({ requestId, merchantId })
      .exec();
    if (!offer) throw new NotFoundException('Offer not found');
    await this.transactionService.execute(async (session) => {
      await this.offerModel
        .deleteOne({ requestId, merchantId }, { session })
        .exec();
    });
    if (this.kafkaService) {
      try {
        await this.kafkaService.emit(KAFKA_TOPICS.OFFER_PROMOTION_DELETED, {
          requestId,
          merchantId,
        });
      } catch (error) {
        console.error('[Offers] Kafka emit error:', error.message);
      }
    }
    await this.redisService.deleteByPattern(
      this.offerMerchantCacheKey(merchantId),
    );
    return offer;
  }

  async getPublicOfferDetails(offerId: string, userId?: string) {
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

    const detailEndsAt =
      row.endDate ||
      (Array.isArray(row.selectedDates)
        ? row.selectedDates[row.selectedDates.length - 1]
        : null) ||
      null;
    if (
      this.isExpiredDate(detailEndsAt) ||
      row.status === OfferPromotionStatus.EXPIRED ||
      !this.isSelectedForDate(row)
    ) {
      throw new NotFoundException('Offer not found');
    }

    const merchant: any = await this.merchantModel
      .findOne({ userId: String(row.merchantId) })
      .select('userId storeName storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto storeCategory storeSubCategory contactNumber phoneNumber mobile mobileNumber merchantPhone storePhone')
      .lean()
      .exec();

    const rowAny: any = row;
    const selectedProducts: any[] = Array.isArray(rowAny.selectedProducts)
      ? rowAny.selectedProducts
      : [];

    const computedBestDiscountPercent = selectedProducts.reduce(
      (best, product) => {
        const original = Number(product?.originalPrice || 0);
        const offerPrice = Number(product?.offerPrice || 0);
        if (original <= 0 || offerPrice < 0 || offerPrice >= original)
          return best;
        const discountPercent = ((original - offerPrice) / original) * 100;
        return Math.max(best, discountPercent);
      },
      0,
    );

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
      displayPrice:
        lowestOfferPrice !== Number.MAX_SAFE_INTEGER
          ? lowestOfferPrice
          : Number(row.totalPrice || 0),
      discountPercent: Math.round(computedBestDiscountPercent),
      startsAt,
      endsAt,
      status: row.status,
      isActiveNow: this.isSelectedForDate(row),
      merchant: {
        merchantId: String(row.merchantId),
        name: merchant?.storeName || row.merchantName || 'Merchant',
        category: merchant?.storeCategory || '',
        subCategory: merchant?.storeSubCategory || '',
        address: merchant?.storeLocation || '',
        latitude: merchant?.storeLocationLatitude || null,
        longitude: merchant?.storeLocationLongitude || null,
        profilePhoto: merchant?.profilePhoto || merchant?.shopPhoto || '',
        contactNumber: merchant?.contactNumber || merchant?.phoneNumber || merchant?.mobile || merchant?.mobileNumber || merchant?.merchantPhone || merchant?.storePhone || null,
        phone: merchant?.phoneNumber || merchant?.contactNumber || merchant?.mobile || merchant?.mobileNumber || merchant?.merchantPhone || merchant?.storePhone || null,
        phoneNumber: merchant?.phoneNumber || merchant?.contactNumber || merchant?.mobile || merchant?.mobileNumber || merchant?.merchantPhone || merchant?.storePhone || null,
        mobile: merchant?.mobile || merchant?.mobileNumber || merchant?.phoneNumber || merchant?.contactNumber || merchant?.merchantPhone || merchant?.storePhone || null,
        mobileNumber: merchant?.mobileNumber || merchant?.mobile || merchant?.phoneNumber || merchant?.contactNumber || merchant?.merchantPhone || merchant?.storePhone || null,
      },
      selectedProducts,
      createdAt: rowAny.createdAt,
      description: rowAny.description || rowAny.promotionExpiryText || '',
      exampleUsage: rowAny.exampleUsage || '',
      termsAndConditions: rowAny.termsAndConditions || '',
    };

    if (userId) {
      this.offerModel.updateOne(
        { _id: row._id },
        [
          {
            $set: {
              viewHistory: {
                $cond: {
                  if: { $in: [userId, { $ifNull: ['$viewHistory', []] }] },
                  then: '$viewHistory',
                  else: {
                    $concatArrays: [
                      { $ifNull: ['$viewHistory', []] },
                      [userId],
                    ],
                  },
                },
              },
            },
          },
          {
            $set: {
              views: { $size: { $ifNull: ['$viewHistory', []] } },
            },
          },
        ]
      ).exec().catch(err => this.logger.error('Failed to track view:', err));
    }

    return normalized;
  }

  async getRecentlyViewedOffers(userId: string) {
    const rows = await this.offerModel.find({
      status: { $in: ['under_review', 'approved', 'active'] },
      viewHistory: userId,
    })
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean()
    .exec();

    return rows.map((row: any) => {
      const selectedProducts = Array.isArray(row.selectedProducts) ? row.selectedProducts : [];
      const computedBestDiscountPercent = selectedProducts.reduce(
        (best, product) => {
          const original = Number(product?.originalPrice || 0);
          const offer = Number(product?.offerPrice || 0);
          if (original <= 0 || offer < 0 || offer >= original) return best;
          const discountPercent = ((original - offer) / original) * 100;
          return Math.max(best, discountPercent);
        },
        0,
      );

      const lowestOfferPrice = selectedProducts.length
        ? selectedProducts.reduce((min, product) => {
            const value = Number(product?.offerPrice || 0);
            return value > 0 ? Math.min(min, value) : min;
          }, Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      return {
        offerId: String(row._id),
        requestId: row.requestId,
        title: row.title || '',
        category: row.category || '',
        imageUrl: row.imageUrl || '',
        totalPrice: Number(row.totalPrice || 0),
        displayPrice:
          lowestOfferPrice !== Number.MAX_SAFE_INTEGER
            ? lowestOfferPrice
            : Number(row.totalPrice || 0),
        discountPercent: Math.round(computedBestDiscountPercent),
        startsAt: row.startDate,
        endsAt: row.endDate || null,
        merchant: {
          merchantId: String(row.merchantId),
          name: row.merchantName || 'Merchant',
        },
        createdAt: row.createdAt,
      };
    });
  }

  // Template helpers using Redis
  async saveOfferTemplate(merchantId: string, payload: any) {
    const normalized = {
      formData: payload.formData || {},
      selectedProducts: Array.isArray(payload.selectedProducts)
        ? payload.selectedProducts
        : [],
      updatedAt: new Date().toISOString(),
    };
    const updated = await this.transactionService.execute(async (session) => {
      return this.merchantModel
        .findOneAndUpdate(
          { userId: merchantId },
          { $set: { offerTemplate: normalized, updatedAt: new Date() } },
          { new: true, session },
        )
        .lean()
        .exec();
    });
    if (!updated) throw new BadRequestException('Failed to save template');
    return normalized;
  }

  async getOfferTemplate(merchantId: string) {
    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .select('offerTemplate')
      .lean()
      .exec();
    return merchant?.offerTemplate || null;
  }

  async clearOfferTemplate(merchantId: string) {
    const updated = await this.transactionService.execute(async (session) => {
      return this.merchantModel
        .findOneAndUpdate(
          { userId: merchantId },
          { $set: { offerTemplate: null, updatedAt: new Date() } },
          { new: true, session },
        )
        .lean()
        .exec();
    });
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

    const prefetchLimit = hasAnyFilter
      ? 5000
      : Math.min(300, Math.max(120, safeLimit * 8));
    const safeRadiusKm = Math.min(
      100,
      Math.max(1, Number(params.radiusKm) || 5),
    );
    const locationNeedle = String(params.location || '')
      .trim()
      .toLowerCase();
    const queryNeedle = String(params.query || '')
      .trim()
      .toLowerCase();
    const categoryNeedle = String(params.category || '')
      .trim()
      .toLowerCase();
    const sortBy = String(params.sort || '')
      .trim()
      .toLowerCase();
    const maxPrice = Number(params.maxPrice);

    const hasUserCoordinates =
      typeof params.latitude === 'number' &&
      !Number.isNaN(params.latitude) &&
      typeof params.longitude === 'number' &&
      !Number.isNaN(params.longitude);

    const now = new Date();
    const startOfToday = this.getStartOfTodayIST();

    let offerRows: any[] = [];
    try {
      offerRows = await this.offerModel
        .find({
          status: { $in: ['under_review', 'approved', 'active'] },
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: startOfToday } },
          ],
        })
        .select(
          'requestId merchantId merchantName title category totalPrice selectedDates startDate endDate status createdAt imageUrl selectedProducts',
        )
        .sort({ createdAt: -1 })
        .limit(prefetchLimit)
        .maxTimeMS(12000)
        .lean()
        .exec();
    } catch (error: any) {
      this.logger.error(
        `Nearby offers query failed: ${error?.message || error}`,
      );
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

    offerRows = offerRows.filter((row) => this.isSelectedForDate(row, now));

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

    const merchantIds = Array.from(
      new Set(offerRows.map((row) => String(row.merchantId))),
    );
    let merchants: any[] = [];
    try {
      merchants = await this.merchantModel
        .find({ userId: { $in: merchantIds } })
        .select(
          'userId storeName storeCategory storeSubCategory storeLocation storeLocationLatitude storeLocationLongitude profilePhoto shopPhoto',
        )
        .maxTimeMS(8000)
        .lean()
        .exec();
    } catch (error: any) {
      this.logger.error(
        `Nearby merchants query failed: ${error?.message || error}`,
      );
      merchants = [];
    }

    const merchantsByUserId = new Map<string, any>(
      merchants.map((m) => [String(m.userId), m]),
    );

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

      usersById = new Map<string, any>(
        users.map((user) => [String(user._id), user]),
      );
    } catch (error: any) {
      this.logger.error(
        `Nearby users query failed: ${error?.message || error}`,
      );
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

    const normalizeCategoryNeedle = (value: string) => {
      return String(value || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const normalizeSearchText = (value: string) => {
      return String(value || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const getSearchTokens = (value: string) => {
      const stopWords = new Set([
        'a',
        'an',
        'and',
        'the',
        'for',
        'near',
        'nearby',
        'in',
        'at',
        'of',
        'to',
        'me',
        'my',
        'with',
        'show',
        'find',
        'search',
      ]);
      return normalizeSearchText(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopWords.has(token));
    };

    const levenshteinDistance = (left: string, right: string) => {
      if (left === right) return 0;
      if (!left) return right.length;
      if (!right) return left.length;

      const previous = Array.from(
        { length: right.length + 1 },
        (_, index) => index,
      );
      const current = Array(right.length + 1).fill(0);

      for (let i = 1; i <= left.length; i += 1) {
        current[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
          const insertCost = current[j - 1] + 1;
          const deleteCost = previous[j] + 1;
          const replaceCost =
            previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
          current[j] = Math.min(insertCost, deleteCost, replaceCost);
        }
        previous.splice(0, previous.length, ...current);
      }

      return previous[right.length];
    };

    const tokensAreSimilar = (queryToken: string, candidateToken: string) => {
      if (!queryToken || !candidateToken) return false;
      if (
        candidateToken.includes(queryToken) ||
        queryToken.includes(candidateToken)
      )
        return true;

      const minLength = Math.min(queryToken.length, candidateToken.length);
      if (minLength < 4) return false;

      const distance = levenshteinDistance(queryToken, candidateToken);
      const maxAllowedDistance = minLength >= 8 ? 2 : 1;
      return distance <= maxAllowedDistance;
    };

    const matchesFlexibleSearch = (
      searchQuery: string,
      values: Array<string | undefined | null>,
    ) => {
      const normalizedQuery = normalizeSearchText(searchQuery);
      if (!normalizedQuery) return true;

      const searchableText = normalizeSearchText(
        values.filter(Boolean).join(' '),
      );
      if (!searchableText) return false;
      if (searchableText.includes(normalizedQuery)) return true;

      const queryTokens = getSearchTokens(normalizedQuery);
      if (!queryTokens.length) return true;

      const searchableTokens = getSearchTokens(searchableText);
      const matchedTokens = queryTokens.filter((queryToken) =>
        searchableTokens.some((candidateToken) =>
          tokensAreSimilar(queryToken, candidateToken),
        ),
      );

      return matchedTokens.length >= 1;
    };

    const CATEGORY_ALIASES: Record<string, string[]> = {
      'food and restaurants': [
        'food and restaurants',
        'food restaurants',
        'food dining',
        'restaurants',
        'restaurant',
        'cafe',
        'cafes',
      ],
      'home services': [
        'home services',
        'cleaning',
        'plumbing',
        'electrical',
        'appliance repair',
        'maintenance',
      ],
      'beauty and wellness': [
        'beauty and wellness',
        'beauty',
        'salon',
        'spa',
        'grooming',
        'personal care',
      ],
      'healthcare and medical': [
        'healthcare and medical',
        'healthcare',
        'medical',
        'hospitals',
        'clinics',
        'pharmacies',
        'diagnostics',
      ],
      'hotels and accommodation': [
        'hotels and accommodation',
        'hotels',
        'accommodation',
        'lodges',
        'stays',
        'room bookings',
      ],
      'shopping and retail': [
        'shopping and retail',
        'shopping',
        'retail',
        'local shops',
        'groceries',
        'fashion',
        'electronics',
        'products',
      ],
      'education and training': [
        'education and training',
        'education',
        'training',
        'schools',
        'coaching',
        'institutes',
        'skill development',
      ],
      'real estate': [
        'real estate',
        'property buying',
        'property selling',
        'renting',
      ],
      'events and entertainment': [
        'events and entertainment',
        'events',
        'entertainment',
        'event planners',
        'photographers',
        'djs',
        'venues',
      ],
      'professional services': [
        'professional services',
        'legal',
        'ca',
        'consulting',
        'freelance services',
      ],
      'automotive services': [
        'automotive services',
        'car repair',
        'bike repair',
        'servicing',
        'rentals',
      ],
      'home improvement': [
        'home improvement',
        'interior design',
        'painting',
        'carpentry',
        'renovation',
      ],
      'fitness and sports': [
        'fitness and sports',
        'fitness',
        'sports',
        'gyms',
        'yoga',
        'personal trainers',
        'sports facilities',
      ],
      'daily needs and utilities': [
        'daily needs and utilities',
        'daily needs',
        'utilities',
        'laundry',
        'water supply',
        'gas',
        'essential services',
      ],
      'local businesses and vendors': [
        'local businesses and vendors',
        'local businesses',
        'vendors',
        'general business listings',
        'b2b',
        'b2c',
        'marketplace',
      ],
    };

    const matchesCategoryQuery = (categoryQuery: string, row: any) => {
      const categoryQueryNorm = normalizeCategoryNeedle(categoryQuery);
      if (!categoryQueryNorm) return true;

      const merchantCategory = normalizeCategoryNeedle(row?.merchant?.category);
      const merchantSubCategory = normalizeCategoryNeedle(
        row?.merchant?.subCategory,
      );
      const offerCategory = normalizeCategoryNeedle(row?.category);
      const searchableValues = [
        merchantCategory,
        merchantSubCategory,
        offerCategory,
      ].filter(Boolean);

      if (searchableValues.includes(categoryQueryNorm)) return true;
      if (
        searchableValues.some(
          (value) =>
            value.includes(categoryQueryNorm) ||
            categoryQueryNorm.includes(value),
        )
      ) {
        return true;
      }

      const aliases = CATEGORY_ALIASES[categoryQueryNorm] || [
        categoryQueryNorm,
      ];
      return aliases
        .map(normalizeCategoryNeedle)
        .some(
          (alias) =>
            alias &&
            searchableValues.some(
              (value) =>
                value === alias ||
                value.includes(alias) ||
                alias.includes(value),
            ),
        );
    };

    // Lightweight alias support so users don't need to type the exact address string.
    // Example: merchants may store "Karvir/Karveer" while users search "Kolhapur".
    const LOCATION_ALIASES: Record<string, string[]> = {
      kolhapur: [
        'kolhapur',
        'karvir',
        'karveer',
        'karveer taluka',
        'karvir taluka',
      ],
      sangli: ['sangli'],
      mumbai: ['mumbai', 'bombay', 'navi mumbai'],
      pune: ['pune', 'poona'],
    };

    const resolveKnownLocationCity = (locationQuery: string) => {
      const normalizedQuery = normalizeLocationNeedle(locationQuery);
      if (!normalizedQuery) return '';

      for (const [city, aliases] of Object.entries(LOCATION_ALIASES)) {
        const candidates = [city, ...aliases]
          .map((alias) => normalizeLocationNeedle(alias))
          .filter(Boolean);
        if (
          candidates.some((candidate) => normalizedQuery.includes(candidate))
        ) {
          return city;
        }
      }

      return normalizeLocationNeedle(
        String(locationQuery || '').split(',')[0] || locationQuery,
      );
    };

    const matchesLocationQuery = (
      locationQueryRaw: string,
      locationBlobRaw: string,
    ) => {
      const locationBlobRawLower = String(locationBlobRaw || '').toLowerCase();
      const locationQueryRawLower = String(
        locationQueryRaw || '',
      ).toLowerCase();
      const locationBlob = normalizeLocationNeedle(locationBlobRawLower);
      const locationQuery = normalizeLocationNeedle(locationQueryRawLower);
      if (!locationQuery) return true;
      if (!locationBlobRawLower && !locationBlob) return false;

      // Prefer matching the city (first comma-separated segment) to avoid
      // matches driven only by state/country tokens like "Maharashtra".
      const cityNorm = resolveKnownLocationCity(locationQueryRawLower);
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
            if (normalizedAlias && locationBlob.includes(normalizedAlias))
              return true;
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
          isActiveNow: this.isSelectedForDate(row, now),
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
          selectedProducts: Array.isArray(row.selectedProducts)
            ? row.selectedProducts
            : [],
          createdAt: row.createdAt,
        };
      });

      if (queryNeedle) {
        normalized = normalized.filter((row) => {
          return matchesFlexibleSearch(queryNeedle, [
            row.title,
            row.category,
            row.merchant.name,
            row.merchant.category,
            row.merchant.subCategory,
            ...(Array.isArray(row.selectedProducts)
              ? row.selectedProducts.flatMap((product) => [
                  product?.productName,
                  product?.name,
                ])
              : []),
          ]);
        });
      }

      if (categoryNeedle) {
        normalized = normalized.filter((row) =>
          matchesCategoryQuery(categoryNeedle, row),
        );
      }

      if (!Number.isNaN(maxPrice) && maxPrice > 0) {
        normalized = normalized.filter((row) => row.displayPrice <= maxPrice);
      }

      normalized.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );

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
      const hasMerchantCoordinates = this.hasValidMerchantCoordinates(
        latitude,
        longitude,
      );

      let distanceKm: number | null = null;
      if (hasUserCoordinates && hasMerchantCoordinates) {
        distanceKm = this.calculateDistanceKm(
          Number(params.latitude),
          Number(params.longitude),
          latitude,
          longitude,
        );
      }

      const selectedProducts: any[] = Array.isArray(row.selectedProducts)
        ? row.selectedProducts
        : [];

      const computedBestDiscountPercent = selectedProducts.reduce(
        (best, product) => {
          const original = Number(product?.originalPrice || 0);
          const offer = Number(product?.offerPrice || 0);
          if (original <= 0 || offer < 0 || offer >= original) return best;
          const discountPercent = ((original - offer) / original) * 100;
          return Math.max(best, discountPercent);
        },
        0,
      );

      const lowestOfferPrice = selectedProducts.length
        ? selectedProducts.reduce((min, product) => {
            const value = Number(product?.offerPrice || 0);
            return value > 0 ? Math.min(min, value) : min;
          }, Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      const isActiveNow = this.isSelectedForDate(row, now);

      return {
        offerId: String(row._id),
        requestId: row.requestId,
        title: row.title,
        category: row.category,
        imageUrl: row.imageUrl || '',
        totalPrice: Number(row.totalPrice || 0),
        displayPrice:
          lowestOfferPrice !== Number.MAX_SAFE_INTEGER
            ? lowestOfferPrice
            : Number(row.totalPrice || 0),
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
          const merchant = merchantKey
            ? merchantsByUserId.get(merchantKey)
            : undefined;
          const user = merchantKey ? usersById.get(merchantKey) : undefined;
          return matchesLocationQuery(
            locationNeedle,
            buildLocationText(merchant, user),
          );
        }

        if (row.distanceKm === null) {
          return true;
        }

        return row.distanceKm <= safeRadiusKm;
      });
    } else if (locationNeedle) {
      normalized = normalized.filter((row) => {
        const merchantKey = String(row?.merchant?.merchantId || '');
        const merchant = merchantKey
          ? merchantsByUserId.get(merchantKey)
          : undefined;
        const user = merchantKey ? usersById.get(merchantKey) : undefined;
        return matchesLocationQuery(
          locationNeedle,
          buildLocationText(merchant, user),
        );
      });
    }

    if (queryNeedle) {
      normalized = normalized.filter((row) => {
        return matchesFlexibleSearch(queryNeedle, [
          row.title,
          row.category,
          row.merchant.name,
          row.merchant.category,
          row.merchant.subCategory,
          row.merchant.address,
          ...(Array.isArray(row.selectedProducts)
            ? row.selectedProducts.flatMap((product) => [
                product?.productName,
                product?.name,
              ])
            : []),
        ]);
      });
    }

    if (categoryNeedle) {
      normalized = normalized.filter((row) =>
        matchesCategoryQuery(categoryNeedle, row),
      );
    }

    if (!Number.isNaN(maxPrice) && maxPrice > 0) {
      normalized = normalized.filter((row) => {
        const hasProductPrices =
          Array.isArray(row.selectedProducts) &&
          row.selectedProducts.length > 0;
        if (!hasProductPrices) return true;
        return row.displayPrice <= maxPrice;
      });
    }

    if (sortBy === 'price_asc') {
      normalized.sort((a, b) => a.displayPrice - b.displayPrice);
    } else if (sortBy === 'price_desc') {
      normalized.sort((a, b) => b.displayPrice - a.displayPrice);
    } else if (sortBy === 'newest') {
      normalized.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
    } else if (hasUserCoordinates) {
      normalized.sort((a, b) => {
        const distanceA = a.distanceKm ?? Number.MAX_SAFE_INTEGER;
        const distanceB = b.distanceKm ?? Number.MAX_SAFE_INTEGER;
        return distanceA - distanceB;
      });
    } else {
      normalized.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
    }

    const total = normalized.length;
    const pages = Math.ceil(total / safeLimit);
    const start = (safePage - 1) * safeLimit;
    const data = normalized.slice(start, start + safeLimit);

    return {
      data,
      pagination: { page: safePage, limit: safeLimit, total, pages },
    };
  }
}

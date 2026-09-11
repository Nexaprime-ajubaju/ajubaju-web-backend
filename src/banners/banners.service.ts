// Ultra Mega Final Cache reset
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { RedisService } from '../common/services/redis.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationSecurityService } from '../security/moderation/moderation-security.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { BannerPricingService } from './services/banner-pricing.service';
import axios from 'axios';
import {
  BannerPromotionType,
  BannerPaymentStatus,
  BannerPromotion,
  BannerPromotionDocument,
  BannerPromotionStatus,
} from './schemas/banner-promotion.schema';
import { SubmitBannerPromotionDto } from './dto/submit-banner-promotion.dto';
import { UpdateBannerPromotionDto } from './dto/update-banner-promotion.dto';
import { TransactionService } from '../common/services/transaction.service';
import { BannerQueueService } from './services/banner-queue.service';
import { BannerServingService } from './services/banner-serving.service';
import { BannerCacheService } from './services/banner-cache.service';
import { WalletsService } from '../wallets/wallets.service';
import { ReferralsService } from '../referrals/referrals.service';

@Injectable()
export class BannersService implements OnModuleInit {
  private readonly logger = new Logger(BannersService.name);
  private readonly legacyOfferCategorySet = new Set([
    'special',
    'festival',
    'limited time',
    'combo',
    'clearance',
  ]);

  constructor(
    @InjectModel(BannerPromotion.name)
    private readonly bannerPromotionModel: Model<BannerPromotionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    private readonly redisService: RedisService,
    private readonly transactionService: TransactionService,
    private readonly moderationService: ModerationService,
    private readonly moderationSecurityService: ModerationSecurityService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly pricingService: BannerPricingService,
    @Optional() private readonly queueService?: BannerQueueService,
    @Optional() private readonly servingService?: BannerServingService,
    @Optional() private readonly cacheService?: BannerCacheService,
    @Optional() private readonly kafkaService?: KafkaService,
    private readonly walletsService?: WalletsService,
    @Optional() private readonly referralsService?: ReferralsService,
  ) {}

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

    // (0,0) is a common placeholder/invalid value for this app.
    if (!inValidRange) {
      return false;
    }

    return !(Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001);
  }

  private merchantListByTypeCacheKey(
    merchantId: string,
    type: BannerPromotionType,
  ): string {
    return `golo:banners:merchant:${merchantId}:${type}`;
  }

  private adminListCacheKey(status?: string): string {
    return `golo:banners:admin:${status || 'all'}`;
  }

  private activeBannersCacheKey(
    limit: number,
    city?: string,
    location?: { lat: number; lng: number; radius: number },
  ): string {
    const cityStr = city
      ? `:city:${city.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : '';
    const locStr = location
      ? `:loc:${location.lat.toFixed(2)},${location.lng.toFixed(2)},${location.radius}`
      : '';
    return `golo:banners:active:${limit}${cityStr}${locStr}`;
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

  private offerTemplateCacheKey(merchantId: string): string {
    return `golo:banners:template:${merchantId}`;
  }

  private async invalidateBannerCache(merchantId?: string): Promise<void> {
    await this.redisService.deleteByPattern('golo:banners:active:*');
    await this.redisService.deleteByPattern('golo:banners:admin:*');
    await this.redisService.deleteByPattern('banner:city:*');
    if (this.cacheService) {
      this.cacheService.clearAllInMemorySlots();
    }
    if (merchantId) {
      await this.redisService.deleteByPattern(
        `golo:banners:merchant:${merchantId}:*`,
      );
    }
  }

  async onModuleInit() {
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for BannersService');
    }
  }

  async saveMerchantOfferTemplate(
    merchantId: string,
    payload: {
      formData?: Record<string, any>;
      selectedProducts?: Array<Record<string, any>>;
    },
  ) {
    const cacheKey = this.offerTemplateCacheKey(merchantId);
    const normalized = {
      formData: payload?.formData || {},
      selectedProducts: Array.isArray(payload?.selectedProducts)
        ? payload.selectedProducts
        : [],
      updatedAt: new Date().toISOString(),
    };

    const persisted = await this.redisService.set(
      cacheKey,
      normalized,
      7 * 24 * 60 * 60,
    );

    if (!persisted) {
      throw new BadRequestException('Failed to save template to cache');
    }

    return normalized;
  }

  async getMerchantOfferTemplate(merchantId: string) {
    const cacheKey = this.offerTemplateCacheKey(merchantId);
    const cached = await this.redisService.get<{
      formData?: Record<string, any>;
      selectedProducts?: Array<Record<string, any>>;
      updatedAt?: string;
    }>(cacheKey);

    if (!cached) {
      return null;
    }

    return {
      formData: cached.formData || {},
      selectedProducts: Array.isArray(cached.selectedProducts)
        ? cached.selectedProducts
        : [],
      updatedAt: cached.updatedAt,
    };
  }

  async clearMerchantOfferTemplate(merchantId: string) {
    const cacheKey = this.offerTemplateCacheKey(merchantId);
    await this.redisService.del(cacheKey);
    return { cleared: true };
  }

  async checkBannerAvailability(city?: string): Promise<{
    available: boolean;
    currentCount: number;
    maxCapacity: number;
    message: string;
  }> {
    const MAX_CAPACITY = 200;
    const now = new Date();

    const query: any = {
      status: {
        $in: [BannerPromotionStatus.ACTIVE, BannerPromotionStatus.APPROVED],
      },
      isHomepageVisible: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    };

    if (city && city !== 'global') {
      const cityNormalized = city.trim().toLowerCase();
      query.$or = [
        { targetCities: { $regex: new RegExp(`^${cityNormalized}$`, 'i') } },
        { targetCities: 'global' },
        { targetCities: { $size: 0 } },
        { targetCities: { $exists: false } },
      ];
    }

    const currentCount = await this.bannerPromotionModel
      .countDocuments(query)
      .exec();
    const available = currentCount < MAX_CAPACITY;

    return {
      available,
      currentCount,
      maxCapacity: MAX_CAPACITY,
      message: available
        ? `Slots are available (${currentCount}/${MAX_CAPACITY} used)`
        : `Slots are full for the day! The maximum capacity of ${MAX_CAPACITY} active banner slots has been reached. Please choose another date or city.`,
    };
  }

  async submitBannerPromotionRequest(
    merchantId: string,
    payload: SubmitBannerPromotionDto,
  ): Promise<BannerPromotion> {
    await this.moderationSecurityService.checkRestriction(merchantId);
    const targetCity =
      (payload.targetCities && payload.targetCities[0]) || 'global';

    // Image URL Validation
    if (!payload.imageUrl) {
      throw new BadRequestException('Image URL is required');
    }

    if (payload.imageUrl.startsWith('data:image')) {
      throw new BadRequestException(
        'Base64 images are not allowed. Image must be uploaded to Cloudinary.',
      );
    }

    if (payload.imageUrl.length > 2048) {
      throw new BadRequestException(
        'Image URL is too long. Image must be uploaded to Cloudinary.',
      );
    }

    try {
      const url = new URL(payload.imageUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error();
      }
    } catch {
      throw new BadRequestException('Invalid image URL format.');
    }

    const availability = await this.checkBannerAvailability(targetCity);
    if (!availability.available) {
      throw new BadRequestException(availability.message);
    }

    const merchant = await this.userModel
      .findById(merchantId)
      .select('name email role accountType')
      .lean()
      .exec();

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.role !== 'merchant' && merchant.accountType !== 'merchant') {
      throw new ForbiddenException(
        'Only merchants can submit banner promotion requests',
      );
    }

    const promotionType =
      payload.promotionType === BannerPromotionType.OFFER
        ? BannerPromotionType.OFFER
        : BannerPromotionType.BANNER;

    let isFreeBanner = false;

    const merchantProfile = await this.merchantModel
      .findOne({ userId: merchantId })
      .select('storeLocation storeLocationLatitude storeLocationLongitude')
      .lean()
      .exec();

    const merchantLatitude = Number(merchantProfile?.storeLocationLatitude);
    const merchantLongitude = Number(merchantProfile?.storeLocationLongitude);
    const hasStoreCoordinates =
      Number.isFinite(merchantLatitude) &&
      Number.isFinite(merchantLongitude) &&
      merchantLatitude >= -90 &&
      merchantLatitude <= 90 &&
      merchantLongitude >= -180 &&
      merchantLongitude <= 180;

    if (!hasStoreCoordinates) {
      throw new BadRequestException(
        'Store coordinates missing. Please set your store location on merchant profile map before publishing offers.',
      );
    }

    const normalizedDates = this.normalizeDateStrings(
      payload.selectedDates || [],
    );

    if (!normalizedDates.length) {
      throw new BadRequestException(
        'Please select at least one valid visibility date',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (normalizedDates[0] < today) {
      throw new BadRequestException('Selected dates cannot be in the past');
    }

    const startDate = new Date(normalizedDates[0]);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(normalizedDates[normalizedDates.length - 1]);
    endDate.setHours(23, 59, 59, 999);

    const selectedDays = normalizedDates.length;
    // Extract Scale and Location
    const scale = payload.coverageType || 'City'; // Fallback

    // Verify Population via GeoNames
    let verifiedPopulation = 0;
    try {
      const username = process.env.GEONAMES_USERNAME || 'atharvapugade';
      let url = `http://api.geonames.org/searchJSON?name_equals=${encodeURIComponent(targetCity)}&country=IN&maxRows=1&username=${username}`;
      if (scale === 'District') url += '&featureCode=ADM2';
      else url += '&featureClass=P';

      const response = await axios.get(url);
      const geonames = response.data?.geonames || [];
      if (geonames.length > 0) {
        verifiedPopulation = geonames[0].population || 0;
      }
    } catch (e) {
      console.error(
        'Failed to verify population during submission:',
        e.message,
      );
    }

    const dailyRate =
      this.pricingService.calculateDailyRate(verifiedPopulation);
    const subtotal = dailyRate * selectedDays;
    const pgCharge = subtotal * 0.025; // 2.5% payment gateway charge
    const gst = (subtotal + pgCharge) * 0.18; // 18% GST
    const computedTotal = subtotal + pgCharge + gst;
    const selectedProducts = (payload.selectedProducts || []).map(
      (product) => ({
        productId: String(product.productId),
        productName: String(product.productName),
        imageUrl: product.imageUrl || '',
        originalPrice: Number(product.originalPrice || 0),
        offerPrice: Number(product.offerPrice || 0),
        stockQuantity: Number(product.stockQuantity || 0),
      }),
    );

    if (payload.imageUrl && this.moderationService) {
      const isSafe = await this.moderationService.isImageSafe(payload.imageUrl);
      if (!isSafe) {
        await this.moderationSecurityService.handleFailure(
          merchantId,
          'new_banner',
          payload.imageUrl,
          'INAPPROPRIATE_CONTENT',
          'single',
        );
        throw new BadRequestException(
          'One or more images contain inappropriate content and cannot be uploaded.',
        );
      }
    }

    const request = await this.transactionService.execute(async (session) => {
      const created = await this.bannerPromotionModel.create(
        [
          {
            requestId: uuidv4(),
            merchantId,
            merchantName: merchant.name || 'Merchant',
            merchantEmail: merchant.email || '-',
            bannerTitle: payload.bannerTitle?.trim(),
            bannerCategory: payload.bannerCategory?.trim(),
            description: payload.description?.trim() || '',
            promotionType,
            imageUrl: payload.imageUrl,
            recommendedSize: payload.recommendedSize || '1920 x 520 px',
            targetCities: payload.targetCities || [],
            targetLocations: (payload.targetLocations || []).map((loc) => ({
              type: 'Point',
              coordinates: [loc.lng, loc.lat],
            })),
            selectedDates: normalizedDates,
            startDate,
            endDate,
            selectedDays,
            dailyRate,
            pgCharge,
            gst,
            totalPrice: isFreeBanner
              ? 0
              : Number(payload.totalPrice || computedTotal),
            loyaltyRewardEnabled: Boolean(payload.loyaltyRewardEnabled),
            loyaltyStarsToOffer: Number(payload.loyaltyStarsToOffer || 0),
            loyaltyStarsPerPurchase: Number(
              payload.loyaltyStarsPerPurchase || 1,
            ),
            loyaltyScorePerStar: Number(payload.loyaltyScorePerStar || 10),
            promotionExpiryText: payload.promotionExpiryText || '',
            termsAndConditions: payload.termsAndConditions || '',
            exampleUsage: payload.exampleUsage || '',
            selectedProducts,
            status: isFreeBanner
              ? BannerPromotionStatus.ACTIVE
              : BannerPromotionStatus.PENDING,
            paymentStatus: isFreeBanner
              ? BannerPaymentStatus.PAID
              : BannerPaymentStatus.PENDING,
            isHomepageVisible: isFreeBanner ? true : false,
          },
        ],
        { session },
      );
      return created[0];
    });

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_SUBMITTED, {
        requestId: request.requestId,
        merchantId,
        bannerTitle: request.bannerTitle,
        bannerCategory: request.bannerCategory,
        totalPrice: request.totalPrice,
      });
    }

    await this.invalidateBannerCache(merchantId);

    return request;
  }

  async listMerchantBannerPromotions(
    merchantId: string,
  ): Promise<BannerPromotion[]> {
    return this.listMerchantPromotionsByType(
      merchantId,
      BannerPromotionType.BANNER,
    );
  }

  async listMerchantPromotionsByType(
    merchantId: string,
    promotionType: BannerPromotionType,
  ): Promise<BannerPromotion[]> {
    const cacheKey = this.merchantListByTypeCacheKey(merchantId, promotionType);
    const cached = await this.redisService.get<BannerPromotion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.expireBannerPromotions();
    // Support both merchant userId and legacy merchant profile _id for visibility across devices
    const merchantProfile = await this.merchantModel
      .findOne({ userId: merchantId })
      .select('_id')
      .lean()
      .exec();
    const profileId = merchantProfile?._id ? String(merchantProfile._id) : null;

    const query: any = profileId
      ? { $or: [{ merchantId }, { merchantId: profileId }], promotionType }
      : { merchantId, promotionType };

    const rows = await this.bannerPromotionModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    await this.redisService.set(cacheKey, rows, 120);
    return rows;
  }

  async listBannerPromotionsForAdmin(
    status?: string,
  ): Promise<BannerPromotion[]> {
    const cacheKey = this.adminListCacheKey(status);
    const cached = await this.redisService.get<BannerPromotion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    await this.expireBannerPromotions();

    const filter: Record<string, any> = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const rows = await this.bannerPromotionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    await this.redisService.set(cacheKey, rows, 60);
    return rows;
  }

  async reviewBannerPromotionRequest(
    requestId: string,
    decision: 'approve' | 'reject',
    adminId: string,
    adminNotes?: string,
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel
      .findOne({ requestId })
      .exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (request.status !== BannerPromotionStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        'Only under review requests can be moderated',
      );
    }

    const updatedRequest = await this.transactionService.execute(
      async (session) => {
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        request.adminNotes = adminNotes || '';

        if (decision === 'approve') {
          request.status = BannerPromotionStatus.ACTIVE;
          request.isHomepageVisible = true;
        } else {
          request.status = BannerPromotionStatus.REJECTED;
          request.isHomepageVisible = false;
        }

        await request.save({ session });
        return request;
      },
    );

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_REVIEWED, {
        requestId,
        decision,
        adminId,
      });
    }

    await this.invalidateBannerCache(updatedRequest.merchantId);

    return updatedRequest;
  }

  async markBannerPromotionAsPaid(
    requestId: string,
    merchantId: string,
    paymentReference?: string,
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel
      .findOne({ requestId, merchantId })
      .exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (request.status !== BannerPromotionStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be paid');
    }

    request.paymentStatus = BannerPaymentStatus.PAID;
    request.paidAt = new Date();
    request.paymentReference = paymentReference || '';
    request.status = BannerPromotionStatus.ACTIVE;
    request.isHomepageVisible = true;

    await request.save();

    // Trigger referral reward
    if (this.referralsService) {
      await this.referralsService.processFirstPurchase(
        merchantId,
        this.merchantModel,
      );
    }

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_PAID, {
        requestId,
        merchantId,
        paymentReference: request.paymentReference,
      });
    }

    await this.invalidateBannerCache(merchantId);

    return request;
  }

  async updateMerchantBannerPromotion(
    requestId: string,
    merchantId: string,
    payload: UpdateBannerPromotionDto,
    expectedType: BannerPromotionType = BannerPromotionType.BANNER,
  ): Promise<BannerPromotion> {
    await this.moderationSecurityService.checkRestriction(merchantId);

    const request = await this.bannerPromotionModel
      .findOne({ requestId, merchantId, promotionType: expectedType })
      .exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (payload.bannerTitle !== undefined) {
      request.bannerTitle = payload.bannerTitle.trim();
    }
    if (payload.bannerCategory !== undefined) {
      request.bannerCategory = payload.bannerCategory.trim();
    }
    if (payload.description !== undefined) {
      request.description = payload.description.trim();
    }
    if (payload.imageUrl !== undefined) {
      if (
        this.moderationService &&
        payload.imageUrl &&
        payload.imageUrl !== request.imageUrl
      ) {
        const isSafe = await this.moderationService.isImageSafe(
          payload.imageUrl,
        );
        if (!isSafe) {
          await this.moderationSecurityService.handleFailure(
            merchantId,
            requestId,
            payload.imageUrl,
            'INAPPROPRIATE_CONTENT',
            'single',
          );
          throw new BadRequestException(
            'Image contains inappropriate content and cannot be uploaded.',
          );
        }
      }
      request.imageUrl = payload.imageUrl;
    }
    if (payload.recommendedSize !== undefined) {
      request.recommendedSize = payload.recommendedSize;
    }

    if (payload.loyaltyRewardEnabled !== undefined) {
      request.loyaltyRewardEnabled = payload.loyaltyRewardEnabled;
    }

    if (payload.loyaltyStarsToOffer !== undefined) {
      request.loyaltyStarsToOffer = Number(payload.loyaltyStarsToOffer || 0);
    }

    if (payload.loyaltyStarsPerPurchase !== undefined) {
      request.loyaltyStarsPerPurchase = Number(
        payload.loyaltyStarsPerPurchase || 1,
      );
    }

    if (payload.loyaltyScorePerStar !== undefined) {
      request.loyaltyScorePerStar = Number(payload.loyaltyScorePerStar || 10);
    }

    if (payload.promotionExpiryText !== undefined) {
      request.promotionExpiryText = payload.promotionExpiryText;
    }

    if (payload.termsAndConditions !== undefined) {
      request.termsAndConditions = payload.termsAndConditions;
    }

    if (payload.exampleUsage !== undefined) {
      request.exampleUsage = payload.exampleUsage;
    }

    if (Array.isArray(payload.selectedProducts)) {
      request.selectedProducts = payload.selectedProducts.map((product) => ({
        productId: String(product.productId),
        productName: String(product.productName),
        imageUrl: product.imageUrl || '',
        originalPrice: Number(product.originalPrice || 0),
        offerPrice: Number(product.offerPrice || 0),
        stockQuantity: Number(product.stockQuantity || 0),
      }));
    }

    if (Array.isArray(payload.selectedDates) && payload.selectedDates.length) {
      const normalizedDates = this.normalizeDateStrings(payload.selectedDates);

      if (!normalizedDates.length) {
        throw new BadRequestException('Please provide valid selectedDates');
      }

      request.selectedDates = normalizedDates;
      const startDate = new Date(normalizedDates[0]);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(normalizedDates[normalizedDates.length - 1]);
      endDate.setHours(23, 59, 59, 999);
      request.startDate = startDate;
      request.endDate = endDate;
      request.selectedDays = normalizedDates.length;
      request.totalPrice =
        request.dailyRate * request.selectedDays + request.platformFee;
    }

    if (payload.action === 'pause') {
      if (
        request.status === BannerPromotionStatus.ACTIVE ||
        request.isHomepageVisible
      ) {
        request.isHomepageVisible = false;
        request.status = BannerPromotionStatus.APPROVED;
        request.pausedAt = new Date();
      }
    }

    if (payload.action === 'resume') {
      if (request.paymentStatus !== BannerPaymentStatus.PAID) {
        throw new BadRequestException(
          'Only paid banner requests can be resumed',
        );
      }

      if (request.pausedAt) {
        const pauseDurationMs =
          new Date().getTime() - request.pausedAt.getTime();
        request.totalPausedDuration =
          (request.totalPausedDuration || 0) + pauseDurationMs;

        if (request.endDate) {
          request.endDate = new Date(
            request.endDate.getTime() + pauseDurationMs,
          );
        }

        request.pausedAt = null;
      }

      request.isHomepageVisible = true;
      request.status = BannerPromotionStatus.ACTIVE;
    }

    await request.save();

    if (
      this.queueService &&
      (payload.action === 'pause' || payload.action === 'resume')
    ) {
      if (request.targetCities && request.targetCities.length > 0) {
        for (const city of request.targetCities) {
          await this.queueService.rebuildCityQueue(city);
        }
      }
      await this.queueService.rebuildCityQueue('global');
    }

    await this.invalidateBannerCache(merchantId);

    return request;
  }

  async getActiveHomepageBanners(
    limit = 9,
    city?: string,
    location?: { lat: number; lng: number; radius: number },
  ): Promise<any[]> {
    if (this.servingService) {
      return this.servingService.getActiveHomepageBanners(
        city,
        undefined,
        limit,
      );
    }
    return [];
  }

  async deleteBannerPromotion(requestId: string): Promise<BannerPromotion> {
    const bannerPromotion = await this.bannerPromotionModel
      .findOne({ requestId })
      .exec();
    if (!bannerPromotion) {
      throw new NotFoundException(
        `Banner promotion with ID ${requestId} not found`,
      );
    }

    await this.bannerPromotionModel.deleteOne({ requestId }).exec();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_DELETED, {
        requestId,
        merchantId: bannerPromotion.merchantId,
      });
    }

    await this.invalidateBannerCache(bannerPromotion.merchantId);
    if (this.queueService) {
      if (
        bannerPromotion.targetCities &&
        bannerPromotion.targetCities.length > 0
      ) {
        for (const city of bannerPromotion.targetCities) {
          await this.queueService.rebuildCityQueue(city);
        }
      }
      await this.queueService.rebuildCityQueue('global');
    }

    return bannerPromotion;
  }

  async cancelBannerPromotion(
    requestId: string,
    merchantId: string,
    expectedType: BannerPromotionType = BannerPromotionType.BANNER,
  ): Promise<BannerPromotion> {
    const bannerPromotion = await this.bannerPromotionModel
      .findOne({ requestId, merchantId, promotionType: expectedType })
      .exec();
    if (!bannerPromotion) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (bannerPromotion.status === BannerPromotionStatus.CANCELLED) {
      throw new BadRequestException('Banner is already cancelled');
    }

    // Calculate leftover money
    const now = new Date();
    let leftoverAmount = 0;

    if (bannerPromotion.paymentStatus === BannerPaymentStatus.PAID) {
      const startDate = bannerPromotion.startDate || now;
      const totalDays = bannerPromotion.selectedDays || 1;
      const totalPrice = bannerPromotion.totalPrice || 0;

      let usedDays = 0;
      if (now > startDate) {
        const diffTime = Math.abs(now.getTime() - startDate.getTime());
        usedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      if (usedDays < totalDays) {
        const leftoverDays = totalDays - usedDays;
        leftoverAmount = (totalPrice / totalDays) * leftoverDays;
        // Credit wallet
        if (this.walletsService && leftoverAmount > 0) {
          await this.walletsService.credit(
            merchantId,
            'merchant',
            leftoverAmount,
            `Refund for cancelled banner: ${bannerPromotion.bannerTitle}`,
            requestId,
            'banner',
          );
        }
      }
    }

    bannerPromotion.status = BannerPromotionStatus.CANCELLED;
    bannerPromotion.isHomepageVisible = false;
    await bannerPromotion.save();

    await this.invalidateBannerCache(merchantId);
    if (this.queueService) {
      if (
        bannerPromotion.targetCities &&
        bannerPromotion.targetCities.length > 0
      ) {
        for (const city of bannerPromotion.targetCities) {
          await this.queueService.rebuildCityQueue(city);
        }
      }
      await this.queueService.rebuildCityQueue('global');
    }

    return bannerPromotion;
  }

  async payWithWallet(
    requestId: string,
    merchantId: string,
    amountToPayFromWallet: number,
    externalPaymentReference?: string,
  ): Promise<BannerPromotion> {
    const request = await this.bannerPromotionModel
      .findOne({ requestId, merchantId })
      .exec();
    if (!request) {
      throw new NotFoundException('Banner promotion request not found');
    }

    if (request.status !== BannerPromotionStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be paid');
    }

    if (amountToPayFromWallet > 0 && this.walletsService) {
      await this.walletsService.debit(
        merchantId,
        'merchant',
        amountToPayFromWallet,
        `Payment for banner: ${request.bannerTitle}`,
        requestId,
        'banner',
      );
    }

    request.paymentStatus = BannerPaymentStatus.PAID;
    request.paidAt = new Date();
    request.paymentReference =
      externalPaymentReference || `WALLET-${Date.now()}`;
    request.status = BannerPromotionStatus.ACTIVE;
    request.isHomepageVisible = true;

    await request.save();

    // Trigger referral reward
    if (this.referralsService) {
      await this.referralsService.processFirstPurchase(
        merchantId,
        this.merchantModel,
      );
    }

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.BANNER_PROMOTION_PAID, {
        requestId,
        merchantId,
        paymentReference: request.paymentReference,
      });
    }

    await this.invalidateBannerCache(merchantId);

    return request;
  }

  async deleteMerchantBannerPromotion(
    requestId: string,
    merchantId: string,
    expectedType: BannerPromotionType = BannerPromotionType.BANNER,
  ): Promise<BannerPromotion> {
    const bannerPromotion = await this.bannerPromotionModel
      .findOne({ requestId, merchantId, promotionType: expectedType })
      .exec();
    if (!bannerPromotion) {
      throw new NotFoundException('Banner promotion request not found');
    }

    await this.bannerPromotionModel.deleteOne({ requestId, merchantId }).exec();
    await this.invalidateBannerCache(merchantId);
    if (this.queueService) {
      if (
        bannerPromotion.targetCities &&
        bannerPromotion.targetCities.length > 0
      ) {
        for (const city of bannerPromotion.targetCities) {
          await this.queueService.rebuildCityQueue(city);
        }
      }
      await this.queueService.rebuildCityQueue('global');
    }
    return bannerPromotion;
  }

  private async expireBannerPromotions(): Promise<void> {
    const now = new Date();

    await this.bannerPromotionModel
      .updateMany(
        {
          status: BannerPromotionStatus.ACTIVE,
          endDate: { $lt: now },
        },
        {
          $set: {
            status: BannerPromotionStatus.EXPIRED,
            isHomepageVisible: false,
          },
        },
      )
      .exec();
  }
}

// ...existing code...
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Ad, AdDocument } from './schemas/category-schemas/ad.schema';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Report, ReportDocument, ReportReason, ReportStatus } from './schemas/report.schema';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../common/services/redis.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class AdsService implements OnModuleInit, OnModuleDestroy {

  /**
   * Get a single report by reportId, with ad and merchant enrichment
   */
  async getReportByReportId(reportId: string): Promise<any | null> {
    try {
      this.logger.log(`Fetching enriched report for reportId: ${reportId}`);
      const results = await this.reportModel.aggregate([
        { $match: { reportId } },
        {
          $lookup: {
            from: 'ads',
            localField: 'adId',
            foreignField: 'adId',
            as: 'ad',
          },
        },
        { $unwind: { path: '$ad', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            adUserObjectId: {
              $cond: [
                { $regexMatch: { input: '$ad.userId', regex: /^[0-9a-fA-F]{24}$/ } },
                { $toObjectId: '$ad.userId' },
                null
              ]
            },
            adUserIdString: '$ad.userId'
          }
        },
        {
         $lookup: {
             from: 'users',
             let: { adUserObjectId: '$adUserObjectId' },
             pipeline: [
               { 
                 $match: { 
                   $expr: { 
                     $and: [
                       { $eq: ['$_id', '$$adUserObjectId'] },
                       { $in: ['$_id', [{ $toObjectId: '$_id' }]] }
                     ]
                   } 
                 } 
               },
             ],
             as: 'uploader',
           },
        },
        { $unwind: { path: '$uploader', preserveNullAndEmptyArrays: true } },
        // Always set uploader.userId from uploader._id if uploader exists
        {
          $addFields: {
            'uploader.userId': {
              $cond: [
                { $ifNull: ['$uploader._id', false] },
                { $toString: '$uploader._id' },
                '$uploader.userId'
              ]
            }
          }
        },
        {
          $lookup: {
            from: 'ads',
            let: { uploaderUserId: '$uploader._id' },
            pipeline: [
              { $match: { $expr: { $and: [ { $eq: [ { $toObjectId: '$userId' }, '$$uploaderUserId' ] }, { $eq: ['$status', 'active'] } ] } } },
            ],
            as: 'uploaderActiveAds',
          },
        },
        {
          $addFields: {
            uploader: {
              $cond: [
                { $ifNull: ['$uploader.userId', false] },
                '$uploader',
                {
                  $cond: [
                    { $and: [
                      { $ifNull: ['$adUserIdString', false] },
                      { $regexMatch: { input: '$adUserIdString', regex: /^[0-9a-fA-F]{24}$/ } }
                    ] },
                    {
                      $let: {
                        vars: { fallbackUserId: { $toObjectId: '$adUserIdString' } },
                        in: {
                          $mergeObjects: [
                            { name: 'No user info', accountType: '-', role: '-', email: '-', userId: '$adUserIdString' },
                            {
                              $arrayElemAt: [
                                {
                                  $map: {
                                    input: {
                                      $filter: {
                                        input: '$$ROOT',
                                        as: 'root',
                                        cond: { $eq: ['$$root._id', '$$fallbackUserId'] }
                                      }
                                    },
                                    as: 'user',
                                    in: {
                                      name: '$$user.name',
                                      accountType: '$$user.accountType',
                                      role: '$$user.role',
                                      email: '$$user.email',
                                      userId: { $toString: '$$user._id' }
                                    }
                                  }
                                },
                                0
                              ]
                            }
                          ]
                        }
                      }
                    },
                    { name: 'No user info', accountType: '-', role: '-', email: '-', userId: '-' }
                  ]
                }
              ]
            },
            uploaderListingCount: { $size: { $ifNull: ['$uploaderActiveAds', []] } },
          },
        },
        {
          $project: {
            reportId: 1,
            adId: 1,
            reportedBy: 1,
            reason: 1,
            description: 1,
            status: 1,
            adminNotes: 1,
            createdAt: 1,
            reviewedAt: 1,
            // Ad details
            'ad.title': 1,
            'ad.price': 1,
            'ad.category': 1,
            'ad.subCategory': 1,
            'ad.images': 1,
            'ad.status': 1,
            'ad.reportCount': 1,
            'ad.userId': 1,
            // Uploader details
            'uploader.name': 1,
            'uploader.accountType': 1,
            'uploader.role': 1,
            'uploader.email': 1,
            'uploader.userId': 1,
            uploaderListingCount: 1,
          },
        },
      ]);
      let result = results[0] || null;
      // Always ensure uploader.userId is present if uploader exists
      if (result && result.uploader && !result.uploader.userId && result.uploader.email) {
        if (result.ad && result.ad.userId) {
          // Try to use ad.userId if uploader is the ad owner
          result.uploader.userId = result.ad.userId;
        } else if (result.uploader._id) {
          // Fallback: use uploader._id if present
          result.uploader.userId = result.uploader._id.toString();
        }
      }
      // FINAL fallback: if uploader.userId is missing or '-', try direct query
      if (result && (!result.uploader || !result.uploader.userId || result.uploader.userId === '-' || result.uploader.name === 'No user info')) {
        // Try to fetch user by ad.userId directly
        const adUserId = result.ad && result.ad.userId ? result.ad.userId : null;
        if (adUserId && /^[0-9a-fA-F]{24}$/.test(adUserId)) {
          const userDoc = await this.userModel.findById(adUserId).lean();
          if (userDoc) {
            result.uploader = {
              name: userDoc.name,
              accountType: userDoc.accountType,
              role: userDoc.role,
              email: userDoc.email,
              userId: userDoc._id.toString(),
            };
          }
        }
      }
      return result;
    } catch (error: any) {
      this.logger.error(`Error fetching enriched report: ${error.message}`);
      throw error;
    }
  }

    /**
     * Get real-time report stats for admin panel cards
     */
    public async getReportStats() {
      const [
        total,
        pending,
        reviewed,
        actionTaken,
        policyViolations,
        resolved24h
      ] = await Promise.all([
        this.reportModel.countDocuments(),
        this.reportModel.countDocuments({ status: 'pending' }),
        this.reportModel.countDocuments({ status: 'reviewed' }),
        this.reportModel.countDocuments({ status: 'action_taken' }),
        this.reportModel.countDocuments({ reason: 'policy_violation' }),
        this.reportModel.countDocuments({ status: 'action_taken', reviewedAt: { $gte: new Date(Date.now() - 24*60*60*1000) } }),
      ]);
      return {
        total,
        pending,
        reviewed,
        actionTaken,
        policyViolations,
        resolved24h
      };
    }
  private readonly logger = new Logger(AdsService.name);
  private emailTransporter: any;
  private emailEnabled: boolean;
  private expirySchedulerInterval: NodeJS.Timeout | null = null;

  // Run expiry check every hour (in milliseconds)
  private readonly EXPIRY_CHECK_INTERVAL_MS = 60 * 60 * 1000;
  // Grace period: keep expired ads in customer's "My Ads" for 1 day
  private readonly GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    private readonly auditLogsService: AuditLogsService,
    private configService: ConfigService,
    public redisService: RedisService, // Make public for controller access
    private eventEmitter: EventEmitter2,

    // ✅ Kafka OPTIONAL
    @Optional() private readonly kafkaService?: KafkaService,
  ) {
    // Initialize email transporter
    this.emailEnabled = !!this.configService.get('EMAIL_USER');
    
    if (this.emailEnabled) {
      this.emailTransporter = nodemailer.createTransport({
        host: this.configService.get('EMAIL_HOST'),
        port: this.configService.get('EMAIL_PORT'),
        secure: false,
        auth: {
          user: this.configService.get('EMAIL_USER'),
          pass: this.configService.get('EMAIL_PASSWORD'),
        },
      });

      this.emailTransporter.verify((error: any, success: any) => {
        if (error) {
          this.logger.error(`Email service verification failed: ${error.message}`);
          this.emailEnabled = false;
        } else {
          this.logger.log('✅ Email service ready and connected');
        }
      });
    } else {
      this.logger.warn('⚠️ Email service not configured - emails will be logged only');
    }
  }

  /* ============================================================
     LIFECYCLE HOOKS — Ad Expiry Scheduler
  ============================================================ */

  async onModuleInit() {
    // Run once on startup, then schedule periodic checks
    this.logger.log('🕐 Starting ad expiry scheduler (runs every hour)');
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for AdsService');
    }
    await this.runExpiryCleanup();
    this.startExpiryScheduler();
  }

  onModuleDestroy() {
    if (this.expirySchedulerInterval) {
      clearInterval(this.expirySchedulerInterval);
      this.expirySchedulerInterval = null;
      this.logger.log('Ad expiry scheduler stopped');
    }
  }

  /**
   * Start the periodic scheduler that checks for expired ads every hour.
   */
  private startExpiryScheduler() {
    this.expirySchedulerInterval = setInterval(async () => {
      await this.runExpiryCleanup();
    }, this.EXPIRY_CHECK_INTERVAL_MS);
  }

  /**
   * Main cleanup routine:
   * 1. Deactivate active ads whose expiryDate has passed
   * 2. Delete expired ads whose grace period (1 day after expiry) has ended
   */
  async runExpiryCleanup(): Promise<void> {
    try {
      const deactivated = await this.deactivateExpiredAds();
      const deleted = await this.deleteGracePeriodAds();

      if (deactivated > 0 || deleted > 0) {
        this.logger.log(
          `🔄 Expiry cleanup: ${deactivated} ads deactivated, ${deleted} ads permanently deleted`,
        );
        // Invalidate cache since ad listings changed
        await this.invalidateAdsCache();
      }
    } catch (error: any) {
      this.logger.error(`Expiry cleanup failed: ${error.message}`);
    }
  }

  /**
   * Step 1: Mark all active ads past their expiryDate as 'expired'.
   * Sets `expiredAt` to the current time so the 1-day grace period starts.
   */
  async deactivateExpiredAds(): Promise<number> {
    const now = new Date();

    const result = await this.adModel.updateMany(
      {
        status: 'active',
        expiryDate: { $lte: now },
      },
      {
        $set: {
          status: 'expired',
          expiredAt: now,
          updatedAt: now,
        },
      },
    ).exec();

    const count = result.modifiedCount ?? 0;
    if (count > 0) {
      this.logger.log(`⏰ Deactivated ${count} expired ads`);

      // Emit Kafka event for each expired ad (batch notification)
      if (this.kafkaService) {
        await this.kafkaService.emit(KAFKA_TOPICS.AD_EXPIRED, {
          count,
          timestamp: now.toISOString(),
        });
      }
    }

    return count;
  }

  /**
   * Step 2: Permanently delete expired ads whose grace period has ended.
   * Grace period = 1 day after `expiredAt` — customer can still see them in "My Ads"
   * during this window, after that they are permanently removed.
   */
  async deleteGracePeriodAds(): Promise<number> {
    const gracePeriodCutoff = new Date(Date.now() - this.GRACE_PERIOD_MS);

    // Find ads to delete (for logging and Kafka events)
    const adsToDelete = await this.adModel
      .find({
        status: 'expired',
        expiredAt: { $lte: gracePeriodCutoff },
      })
      .select('adId userId title')
      .lean()
      .exec();

    if (adsToDelete.length === 0) return 0;

    // Also delete associated reports
    const adIdsToDelete = adsToDelete.map((ad) => ad.adId).filter(Boolean);
    if (adIdsToDelete.length > 0) {
      await this.reportModel.deleteMany({ adId: { $in: adIdsToDelete } }).exec();
    }

    // Permanently delete the ads
    const result = await this.adModel.deleteMany({
      status: 'expired',
      expiredAt: { $lte: gracePeriodCutoff },
    }).exec();

    const count = result.deletedCount ?? 0;
    if (count > 0) {
      this.logger.log(`🗑️ Permanently deleted ${count} expired ads (grace period ended)`);

      // Emit Kafka events
      if (this.kafkaService) {
        for (const ad of adsToDelete) {
          await this.kafkaService.emit(KAFKA_TOPICS.AD_DELETED, {
            adId: ad.adId,
            userId: ad.userId,
            reason: 'grace_period_ended',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return count;
  }

  /* ============================================================
     CACHE KEY HELPERS
  ============================================================ */

  public getCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
    const validParts = parts.filter(p => p !== undefined && p !== null);
    return `golo:${prefix}:${validParts.join(':')}`;
  }

  public async invalidateAdsCache(): Promise<void> {
    if (!this.redisService.isEnabled()) return;
    
    // Invalidate homepage and category caches when ads change
    await this.redisService.deleteByPattern('golo:ads:homepage:*');
    await this.redisService.deleteByPattern('golo:ads:category:*');
    await this.redisService.deleteByPattern('golo:ads:trending:*');
    this.logger.log('🔄 Ads cache invalidated');
  }

  /* ============================================================
     CREATE AD
  ============================================================ */

  async createAd(createAdDto: CreateAdDto): Promise<Ad> {
    this.logger.log(`Creating new ad for user: ${createAdDto.userId}`);

    const userExists = await this.verifyUser(createAdDto.userId);
    if (!userExists) {
      throw new BadRequestException(
        `User with ID ${createAdDto.userId} not found.`,
      );
    }

    let categorySpecificData: any = {};
    const payload: any = createAdDto as any;

    switch (createAdDto.category) {
      case 'Vehicle':
        categorySpecificData = payload.vehicleData || {};
        break;
      case 'Property':
        categorySpecificData = payload.propertyData || {};
        break;
      case 'Service':
        categorySpecificData = payload.serviceData || {};
        break;
      case 'Mobiles':
        categorySpecificData = payload.mobileData || {};
        break;
      case 'Electronics':
      case 'Electronics & Home appliances':
        categorySpecificData = payload.electronicsData || {};
        break;
      case 'Furniture':
        categorySpecificData = payload.furnitureData || {};
        break;
      case 'Education':
        categorySpecificData = payload.educationData || {};
        break;
      case 'Pets':
        categorySpecificData = payload.petsData || {};
        break;
      case 'Matrimonial':
        categorySpecificData = payload.matrimonialData || {};
        break;
      case 'Business':
        categorySpecificData = payload.businessData || {};
        break;
      case 'Travel':
        categorySpecificData = payload.travelData || {};
        break;
      case 'Astrology':
        categorySpecificData = payload.astrologyData || {};
        break;
      case 'Employment':
        categorySpecificData = payload.employmentData || {};
        break;
      case 'Lost & Found':
        categorySpecificData = payload.lostFoundData || payload.lostAndFoundData || {};
        break;
      case 'Personal':
        categorySpecificData = payload.personalData || {};
        break;
      case 'Public Notice':
        categorySpecificData = payload.publicNoticeData || {};
        break;
      case 'Greetings & Tributes':
        categorySpecificData = payload.greetingsData || payload.otherData || {};
        break;
      case 'Other':
        categorySpecificData = payload.otherData || {};
        break;
    }

    if (!categorySpecificData || Object.keys(categorySpecificData).length === 0) {
      categorySpecificData = payload.categorySpecificData || {};
    }

    this.validateCategoryData(createAdDto.category, categorySpecificData);

    // If the user selected specific scheduling dates, expire the ad at the end
    // of the last chosen day. Otherwise, fall back to an explicit expiryDate or
    // the default 30-day window.
    const expiryDate = (() => {
      if (createAdDto.selectedDates && createAdDto.selectedDates.length > 0) {
        const lastDate = new Date(
          Math.max(...createAdDto.selectedDates.map((d) => new Date(d).getTime())),
        );
        lastDate.setHours(23, 59, 59, 999);
        return lastDate;
      }
      return (
        createAdDto.expiryDate ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );
    })();

    const adData: any = {
      ...createAdDto,
      categorySpecificData,
      adId: uuidv4(),
      status: 'active',
      views: 0,
      expiryDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const savedAd = await new this.adModel(adData).save();

    this.logger.log(`Ad created successfully: ${savedAd.adId}`);

    await this.emitAdCreated(savedAd, uuidv4());

    return savedAd;
  }

  /* ============================================================
     ADMIN
  ============================================================ */

  async adminDeleteAd(adId: string, adminId?: string, adminEmail?: string): Promise<void> {
    const ad: any = await this.adModel.findOneAndDelete({ adId }).exec();
    
    if (adminId && adminEmail && ad) {
      await this.auditLogsService.log({
        action: 'AD_DELETED_BY_ADMIN',
        adminId,
        adminEmail,
        targetId: adId,
        targetType: 'Ad',
        details: { title: ad.title, category: ad.category }
      });
    }
  }

  async adminUpdateAd(adId: string, updateData: UpdateAdDto, adminId?: string, adminEmail?: string): Promise<Ad> {
    const updatedAd = await this.adModel
      .findOneAndUpdate(
        { adId },
        { $set: { ...updateData, updatedAt: new Date() } },
        { new: true },
      )
      .exec();

    if (!updatedAd) {
      throw new NotFoundException(`Ad ${adId} not found`);
    }

    if (adminId && adminEmail) {
      await this.auditLogsService.log({
        action: 'AD_UPDATED_BY_ADMIN',
        adminId,
        adminEmail,
        targetId: adId,
        targetType: 'Ad',
        details: { updateData }
      });
    }

    return updatedAd;
  }

  async adminGetAllAds(): Promise<Ad[]> {
    return this.adModel.find().sort({ createdAt: -1 }).exec();
  }

  /* ============================================================
     USER VERIFY
  ============================================================ */

  async verifyUser(userId: any): Promise<boolean> {
    try {
      if (!userId) return false;

      const userIdStr = String(userId);

      if (!userIdStr.match(/^[0-9a-fA-F]{24}$/)) return false;

      const user = await this.userModel
        .findById(userIdStr)
        .lean()
        .exec();

      return !!user;
    } catch (error: any) {
      this.logger.error(`User verify error: ${error.message}`);
      return false;
    }
  }

  /* ============================================================
     GETTERS
  ============================================================ */

  async getAdById(adId: string): Promise<Ad> {
    let ad = await this.adModel.findOne({ adId }).exec();

    if (!ad && /^[0-9a-fA-F]{24}$/.test(adId)) {
      ad = await this.adModel.findById(adId).exec();
    }

    if (!ad) throw new NotFoundException(`Ad ${adId} not found`);
    return ad;
  }

  async getAdsByCategory(
    category: string,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  ): Promise<{ ads: Ad[]; total: number }> {
    const skip = (page - 1) * limit;

    const sort: { [key: string]: SortOrder } = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [ads, total] = await Promise.all([
      this.adModel
        .find({ category, status: 'active' })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.adModel.countDocuments({
        category,
        status: 'active',
      }),
    ]);

    return { ads, total };
  }

  /* ============================================================
     SEARCH / LISTING HELPERS
  ============================================================ */

  async searchAds(
    query: string,
    filters: any = {},
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    lat?: number,
    lng?: number,
  ): Promise<{ ads: Ad[]; total: number }> {
    const skip = (page - 1) * limit;

    const mongoQuery: any = { status: 'active' };

    if (filters?.category) mongoQuery.category = filters.category;
    if (filters?.location && String(filters.location).trim()) {
      const normalizedLocation = String(filters.location).trim();
      const escapedLocation = normalizedLocation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const locationRegex = new RegExp(escapedLocation, 'i');

      mongoQuery.$or = [
        { location: locationRegex },
        { city: locationRegex },
        { state: locationRegex },
        { pincode: locationRegex },
        { cities: { $elemMatch: { $regex: locationRegex } } },
      ];
    }
    if (typeof filters?.minPrice === 'number') mongoQuery.price = { ...(mongoQuery.price || {}), $gte: filters.minPrice };
    if (typeof filters?.maxPrice === 'number') mongoQuery.price = { ...(mongoQuery.price || {}), $lte: filters.maxPrice };

    if (query && query.trim().length > 0) {
      // Prefer text index when available
      mongoQuery.$text = { $search: query };
    }

    let sort: any = {};
    const countQuery = { ...mongoQuery };

    if (sortBy === 'distance' && lat !== undefined && lng !== undefined) {
      mongoQuery.locationCoordinates = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
        },
      };
      // $near fails in countDocuments, so just count docs that have coordinates matching other filters
      countQuery.locationCoordinates = { $exists: true, $ne: null };
    } else {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const [ads, total] = await Promise.all([
      this.adModel
        .find(mongoQuery)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.adModel.countDocuments(countQuery),
    ]);

    return { ads, total };
  }

  async getNearbyAds(
    lat: number,
    lng: number,
    maxDistance = 10000,
    category?: string,
    page = 1,
    limit = 10,
  ): Promise<{ ads: Ad[]; total: number }> {
    const skip = (page - 1) * limit;

    const geoQuery: any = { status: 'active' };
    if (category) geoQuery.category = category;

    const countQuery = { ...geoQuery };

    // Try geo query if coordinates are stored
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      geoQuery.locationCoordinates = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: maxDistance,
        },
      } as any;
      
      // $near fails in countDocuments, use $geoWithin $centerSphere instead
      countQuery.locationCoordinates = {
        $geoWithin: {
          $centerSphere: [[lng, lat], maxDistance / 6378100],
        },
      } as any;
    }

    const [ads, total] = await Promise.all([
      this.adModel
        .find(geoQuery)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.adModel.countDocuments(countQuery),
    ]);

    return { ads, total };
  }

  async getAdsByUser(userId: string, page = 1, limit = 10): Promise<{ ads: Ad[]; total: number }> {
    const skip = (page - 1) * limit;

    // Show both 'active' AND 'expired' ads — expired ads remain visible to the
    // ad owner for 1 day (grace period) so they know their ad has ended.
    // After the grace period, deleteGracePeriodAds() removes them permanently.
    const query = { userId, status: { $in: ['active', 'expired'] } };

    const [ads, total] = await Promise.all([
      this.adModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.adModel.countDocuments(query),
    ]);

    return { ads, total };
  }

  async getFeaturedDeals(limit = 10): Promise<Ad[]> {
    const now = new Date();
    return this.adModel
      .find({ isPromoted: true, promotedUntil: { $gt: now }, status: 'active' })
      .sort({ promotedUntil: -1 })
      .limit(limit)
      .exec();
  }

  async getTrendingSearches(limit = 10): Promise<string[]> {
    // Return top ad titles as trending searches
    const docs = await this.adModel
      .find({ status: 'active' })
      .sort({ views: -1 })
      .limit(limit)
      .select('title')
      .lean()
      .exec();

    // Extract just the titles and remove duplicates
    const titles = [...new Set(docs.map(doc => doc.title).filter(Boolean))];
    return titles.slice(0, limit);
  }

  async getRecommendedDeals(userId: string | undefined, limit = 10): Promise<Ad[]> {
    // Simple recommendation: if user provided, try same city from user's profile
    if (userId) {
      try {
        const user = await this.userModel.findById(String(userId)).lean().exec();
        const city = user?.profile?.city;
        if (city) {
          return this.adModel
            .find({ city, status: 'active' })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
        }
      } catch (e) {
        this.logger.warn(`Recommendation lookup failed: ${e.message}`);
      }
    }

    // Fallback: most recent active ads
    return this.adModel.find({ status: 'active' }).sort({ createdAt: -1 }).limit(limit).exec();
  }

  async getPopularPlaces(limit = 10): Promise<string[]> {
    // Aggregate top cities by ad count and return just city names
    const pipeline = [
      { $match: { status: 'active', city: { $exists: true, $ne: null } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 1 } },
    ];

    const results = await (this.adModel as any).aggregate(pipeline).exec();
    return results.map(r => r._id).filter(Boolean);
  }

  async incrementViewCount(adId: string): Promise<void> {
    try {
      const merchantId = await this.resolveMerchantIdForAd(adId);
      let updated = await this.adModel.findOneAndUpdate(
        { adId },
        { $inc: { views: 1 }, $set: { updatedAt: new Date() } },
      ).exec();

      if (!updated && /^[0-9a-fA-F]{24}$/.test(adId)) {
        await this.adModel.findByIdAndUpdate(
          adId,
          { $inc: { views: 1 }, $set: { updatedAt: new Date() } },
        ).exec();
      }

      if (merchantId) {
        await this.recordMerchantVisit(merchantId);
      }
    } catch (error: any) {
      this.logger.error(`Failed to increment view count for ${adId}: ${error.message}`);
    }
  }

  /* ============================================================
     ANALYTICS
  ============================================================ */

  /**
   * Track a view for authenticated users only — views always equals viewHistory.length.
   * visitorId should be userId from JWT token (no anonymous tracking).
   */
  async trackViewWithVisitor(adId: string, userId: string): Promise<void> {
    try {
      if (!userId) {
        this.logger.warn(`trackViewWithVisitor: No userId provided for ad ${adId}`);
        return;
      }

      // Resolve to UUID adId if a MongoDB _id was passed
      let resolvedAdId = adId;
      if (/^[0-9a-fA-F]{24}$/.test(adId)) {
        const found = await this.adModel.findById(adId).select('adId').lean().exec();
        if (found?.adId) resolvedAdId = found.adId;
      }

      // Add userId to viewHistory and sync views = viewHistory.length atomically
      const updated = await this.adModel.findOneAndUpdate(
        { adId: resolvedAdId },
        [
          {
            $set: {
              viewHistory: {
                $cond: {
                  if: { $in: [userId, { $ifNull: ['$viewHistory', []] }] },
                  then: '$viewHistory',
                  else: { $concatArrays: [{ $ifNull: ['$viewHistory', []] }, [userId]] },
                },
              },
              updatedAt: new Date(),
            },
          },
          {
            $set: {
              views: { $size: '$viewHistory' },
            },
          },
        ],
        { new: true },
      ).exec();

      if (!updated) {
        this.logger.warn(`trackViewWithVisitor: ad not found for adId=${resolvedAdId}`);
      }

      const merchantId = await this.resolveMerchantIdForAd(resolvedAdId);
      if (merchantId) {
        await this.recordMerchantVisit(merchantId);
      }
    } catch (error: any) {
      this.logger.error(`Failed to track view for user ${userId} on ad ${adId}: ${error.message}`);
    }
  }

  private async resolveMerchantIdForAd(adId: string): Promise<string | null> {
    try {
      const query = /^[0-9a-fA-F]{24}$/.test(adId)
        ? { $or: [{ adId }, { _id: adId }] }
        : { adId };

      const ad = await this.adModel
        .findOne(query)
        .select('userId')
        .lean()
        .exec();

      return ad?.userId ? String(ad.userId) : null;
    } catch (error: any) {
      this.logger.error(`Failed to resolve merchant for ad ${adId}: ${error.message}`);
      return null;
    }
  }

  private async recordMerchantVisit(merchantId: string, occurredAt = new Date()): Promise<void> {
    const redisClient = this.redisService?.getClient?.();
    if (!redisClient || !merchantId) {
      return;
    }

    try {
      const dayKey = occurredAt.toISOString().slice(0, 10);
      const redisKey = `merchant:visits:daily:${merchantId}`;

      await redisClient.hIncrBy(redisKey, dayKey, 1);
      await redisClient.expire(redisKey, 60 * 60 * 24 * 60);
    } catch (error: any) {
      this.logger.error(`Failed to record merchant visit for ${merchantId}: ${error.message}`);
    }
  }

  /**
   * Increment contact click count when a user clicks Chat or Call on an ad.
   */
  async trackContactClick(adId: string): Promise<void> {
    try {
      let updated = await this.adModel.findOneAndUpdate(
        { adId },
        { $inc: { contactClicks: 1 }, $set: { updatedAt: new Date() } },
      ).exec();

      if (!updated && /^[0-9a-fA-F]{24}$/.test(adId)) {
        await this.adModel.findByIdAndUpdate(
          adId,
          { $inc: { contactClicks: 1 }, $set: { updatedAt: new Date() } },
        ).exec();
      }
    } catch (error: any) {
      this.logger.error(`Failed to track contact click for ${adId}: ${error.message}`);
    }
  }

  /**
   * Get analytics summary for all ads posted by a specific user.
   */
  async getMyAnalytics(userId: string): Promise<{
    summary: {
      totalAds: number;
      activeAds: number;
      totalViews: number;
      uniqueVisitors: number;
      totalContactClicks: number;
      promotedAds: number;
      totalWishlistSaves: number;
    };
    ads: any[];
  }> {
    const owner = await this.userModel
      .findById(userId)
      .select('name email role profile metadata createdAt')
      .lean()
      .exec();

    const ads = await this.adModel
      .find({ userId })
      .select('adId title description category subCategory status views viewHistory contactClicks isPromoted promotedUntil createdAt updatedAt price images videos city state pincode location locationCoordinates contactInfo primaryContact cities language selectedDates templateId tags expiryDate metadata categorySpecificData reportCount isUnderReview autoDisabled disabledAt disabledReason negotiable')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const adIds = ads.map(a => a.adId).filter(Boolean);

    // Count how many users have each ad in their wishlist
    const wishlistCounts: Record<string, number> = {};
    if (adIds.length > 0) {
      const wishlistAgg = await this.userModel.aggregate([
        { $match: { wishlist: { $in: adIds } } },
        { $unwind: '$wishlist' },
        { $match: { wishlist: { $in: adIds } } },
        { $group: { _id: '$wishlist', count: { $sum: 1 } } },
      ]).exec();
      for (const item of wishlistAgg) {
        wishlistCounts[item._id] = item.count;
      }
    }

    const totalAds = ads.length;
    const activeAds = ads.filter(a => a.status === 'active').length;
    const promotedAds = ads.filter(a => a.isPromoted && a.promotedUntil && new Date(a.promotedUntil) > new Date()).length;
    // views = unique visitors only (viewHistory.length is the source of truth)
    const totalViews = ads.reduce((sum, a) => sum + (a.viewHistory?.length || 0), 0);
    const uniqueVisitors = totalViews; // same — views IS unique visitors
    const totalContactClicks = ads.reduce((sum, a) => sum + (a.contactClicks || 0), 0);
    const totalWishlistSaves = Object.values(wishlistCounts).reduce((sum, c) => sum + c, 0);

    const adsWithAnalytics = ads.map(ad => ({
      adId: ad.adId,
      title: ad.title,
      description: ad.description,
      category: ad.category,
      subCategory: ad.subCategory,
      status: ad.status,
      price: ad.price,
      negotiable: ad.negotiable || false,
      location: ad.location,
      city: ad.city,
      state: ad.state,
      pincode: ad.pincode,
      cities: ad.cities || [],
      language: ad.language || 'english',
      image: ad.images?.[0] || null,
      imageCount: ad.images?.length || 0,
      videoCount: ad.videos?.length || 0,
      templateId: ad.templateId || 1,
      views: ad.viewHistory?.length || 0,          // unique visitors = views
      uniqueVisitors: ad.viewHistory?.length || 0, // kept for compatibility
      viewerIds: ad.viewHistory || [],
      contactClicks: ad.contactClicks || 0,
      wishlistCount: wishlistCounts[ad.adId] || 0,
      clickThroughRate: (ad.viewHistory?.length || 0) > 0 ? Number((((ad.contactClicks || 0) / (ad.viewHistory?.length || 0)) * 100).toFixed(2)) : 0,
      wishlistRate: (ad.viewHistory?.length || 0) > 0 ? Number((((wishlistCounts[ad.adId] || 0) / (ad.viewHistory?.length || 0)) * 100).toFixed(2)) : 0,
      isPromoted: ad.isPromoted || false,
      promotedUntil: ad.promotedUntil || null,
      expiryDate: ad.expiryDate || null,
      reportCount: ad.reportCount || 0,
      isUnderReview: ad.isUnderReview || false,
      autoDisabled: ad.autoDisabled || false,
      disabledAt: ad.disabledAt || null,
      disabledReason: ad.disabledReason || null,
      tags: ad.tags || [],
      selectedDates: ad.selectedDates || [],
      primaryContact: ad.primaryContact || null,
      contactInfo: ad.contactInfo || null,
      metadata: ad.metadata || null,
      locationCoordinates: ad.locationCoordinates || null,
      categorySpecificData: ad.categorySpecificData || null,
      ownerName: owner?.name || null,
      ownerEmail: owner?.email || null,
      ownerRole: owner?.role || null,
      ownerProfile: owner?.profile || null,
      ownerMetadata: owner?.metadata || null,
      ownerCreatedAt: owner?.createdAt || null,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    }));

    return {
      summary: { totalAds, activeAds, totalViews, uniqueVisitors, totalContactClicks, promotedAds, totalWishlistSaves },
      ads: adsWithAnalytics,
    };
  }

  /**
   * Count how many users have a specific ad in their wishlist.
   * The adId stored in User.wishlist is always the UUID adId field.
   * We resolve it first in case a MongoDB _id is passed.
   */
  async getAdWishlistCount(adId: string): Promise<number> {
    try {
      // Resolve to UUID adId — needed when URL contains MongoDB _id
      let resolvedAdId = adId;
      const ad = await this.adModel
        .findOne({ adId })
        .select('adId')
        .lean()
        .exec();

      if (!ad && /^[0-9a-fA-F]{24}$/.test(adId)) {
        // Passed a MongoDB _id — look up the real UUID
        const adById = await this.adModel
          .findById(adId)
          .select('adId')
          .lean()
          .exec();
        if (adById?.adId) resolvedAdId = adById.adId;
      } else if (ad?.adId) {
        resolvedAdId = ad.adId;
      }

      const count = await this.userModel
        .countDocuments({ wishlist: resolvedAdId })
        .exec();
      return count;
    } catch (error: any) {
      this.logger.error(`Failed to get wishlist count for ${adId}: ${error.message}`);
      return 0;
    }
  }

  /* ============================================================
     UPDATE / DELETE
  ============================================================ */

  /**
   * One-time migration: set views = viewHistory.length for every ad.
   * Fixes all existing ads that have inflated view counts from non-unique tracking.
   */
  async resyncViewCounts(): Promise<{ updated: number }> {
    const result = await (this.adModel as any).updateMany(
      {},
      [
        { $set: { views: { $size: { $ifNull: ['$viewHistory', []] } } } },
      ],
    ).exec();
    return { updated: result.modifiedCount ?? result.nModified ?? 0 };
  }

  async updateAd(
    adId: string,
    userId: string,
    updateData: UpdateAdDto,
  ): Promise<Ad> {
    const ad = await this.getAdById(adId);

    if (ad.userId !== userId) {
      throw new ForbiddenException(
        'You can only update your own ads',
      );
    }

    const currentEditCount = typeof (ad as any).editCount === 'number' ? (ad as any).editCount : 0;
    const hasUsedEdit = Boolean((ad as any).hasUsedEdit) || currentEditCount >= 1;

    if (hasUsedEdit) {
      throw new ForbiddenException('You can edit an ad only once');
    }

    const updatedAd = await this.adModel
      .findOneAndUpdate(
        { adId },
        {
          $set: {
            ...updateData,
            updatedAt: new Date(),
            hasUsedEdit: true,
            editedAt: new Date(),
          },
          $inc: { editCount: 1 },
        },
        { new: true },
      )
      .exec();

    if (!updatedAd)
      throw new NotFoundException(`Ad ${adId} not found`);

    await this.emitAdUpdated(updatedAd, uuidv4());

    return updatedAd;
  }

  async deleteAd(adId: string, userId: string): Promise<void> {
    const ad = await this.getAdById(adId);

    if (ad.userId !== userId) {
      throw new ForbiddenException(
        'You can only delete your own ads',
      );
    }

    await this.adModel
      .findOneAndUpdate(
        { adId },
        { status: 'deleted', updatedAt: new Date() },
      )
      .exec();

    await this.emitAdDeleted(adId, userId, uuidv4());
  }

  /* ============================================================
     ✅ SAFE KAFKA EVENTS (PUBLIC NOW)
  ============================================================ */

   async emitAdCreated(ad: Ad, correlationId: string): Promise<void> {
     if (!this.kafkaService) {
       this.logger.debug('Kafka disabled - AD_CREATED event not emitted');
       return;
     }

     try {
       await this.kafkaService.emit(
         KAFKA_TOPICS.AD_CREATED,
         {
           adId: ad.adId,
           userId: ad.userId,
           title: ad.title,
           category: ad.category,
           price: ad.price,
           timestamp: new Date().toISOString(),
         },
         correlationId,
       );
     } catch (error) {
       this.logger.error(`Failed to emit AD_CREATED event: ${error.message}`);
     }
   }

   async emitAdUpdated(ad: Ad, correlationId: string): Promise<void> {
     if (!this.kafkaService) {
       this.logger.debug('Kafka disabled - AD_UPDATED event not emitted');
       return;
     }

     try {
       await this.kafkaService.emit(
         KAFKA_TOPICS.AD_UPDATED,
         {
           adId: ad.adId,
           userId: ad.userId,
           timestamp: new Date().toISOString(),
         },
         correlationId,
       );
     } catch (error) {
       this.logger.error(`Failed to emit AD_UPDATED event: ${error.message}`);
     }
   }

   async emitAdDeleted(
     adId: string,
     userId: string,
     correlationId: string,
   ): Promise<void> {
     if (!this.kafkaService) {
       this.logger.debug('Kafka disabled - AD_DELETED event not emitted');
       return;
     }

     try {
       await this.kafkaService.emit(
         KAFKA_TOPICS.AD_DELETED,
         {
           adId,
           userId,
           timestamp: new Date().toISOString(),
         },
         correlationId,
       );
     } catch (error) {
       this.logger.error(`Failed to emit AD_DELETED event: ${error.message}`);
     }
   }

  /* ============================================================
     REPORTING & MODERATION
  ============================================================ */

  /**
   * Submit a report for an ad - auto-disables at 10 reports
   */
  async submitReport(
    adId: string,
    userId: string,
    reason: ReportReason,
    description?: string,
  ): Promise<{ success: boolean; message: string; reportId: string }> {
    try {
      this.logger.log(`User ${userId} reporting ad ${adId} for reason: ${reason}`);

      // Resolve adId - could be UUID or MongoDB _id
      let resolvedAdId = adId;
      if (/^[0-9a-fA-F]{24}$/.test(adId)) {
        // If it looks like MongoDB _id, get the UUID adId
        const found = await this.adModel.findById(adId).select('adId').lean().exec();
        if (found?.adId) {
          resolvedAdId = found.adId;
        }
      }

      // Check if ad exists
      const ad = await this.adModel.findOne({ adId: resolvedAdId }).exec();
      if (!ad) {
        throw new NotFoundException('Ad not found');
      }

      // Prevent owner from reporting their own ad
      if (ad.userId === userId) {
        throw new ForbiddenException('You cannot report your own ad');
      }

      // Check if user already reported this ad
      const existingReport = await this.reportModel
        .findOne({ adId: resolvedAdId, reportedBy: userId })
        .exec();
      
      if (existingReport) {
        throw new BadRequestException('You have already reported this ad');
      }

      // Create report
      const report = await this.reportModel.create({
        reportId: uuidv4(),
        adId: resolvedAdId,
        reportedBy: userId,
        reason,
        description: description || '',
        status: ReportStatus.PENDING,
      });

      // Increment report count on ad
      const updatedAd = await this.adModel.findOneAndUpdate(
        { adId: resolvedAdId },
        {
          $inc: { reportCount: 1 },
          $set: { isUnderReview: true },
        },
        { new: true },
      ).exec();

      // Auto-disable if 10 or more reports
      if ((updatedAd?.reportCount ?? 0) >= 10) {
        await this.autoDisableAd(resolvedAdId, `Auto-disabled: ${updatedAd?.reportCount} reports`);
      }

      // Emit Kafka event for notifications
      if (this.kafkaService) {
        await this.kafkaService.emit(KAFKA_TOPICS.AD_REPORT_SUBMITTED, {
          reportId: report.reportId,
          adId: resolvedAdId,
          reportedBy: userId,
          reason,
          reportCount: updatedAd?.reportCount,
          timestamp: new Date().toISOString(),
        });
      }

      // Emit event for WebSocket notification
      this.eventEmitter.emit('report.submitted', {
        reportId: report.reportId,
        adId: resolvedAdId,
        reportedBy: userId,
        reason,
        reportCount: updatedAd?.reportCount,
        timestamp: new Date().toISOString(),
      });

      // Send email notification to admin
      if (this.emailEnabled && this.emailTransporter) {
        try {
          const adData = await this.adModel.findOne({ adId: resolvedAdId }).select('title').lean().exec();
          const adminEmail = this.configService.get('ADMIN_EMAIL');
          
          if (adminEmail) {
            const mailOptions = {
              from: this.configService.get('EMAIL_FROM'),
              to: adminEmail,
              subject: `🚨 Ad Reported: ${reason.toUpperCase()} (${updatedAd?.reportCount || 1} reports)`,
              html: this.generateReportEmailHTML({
                adId: resolvedAdId,
                adTitle: adData?.title || 'Unknown',
                reason,
                description: description || '',
                reportedBy: userId,
                reportCount: updatedAd?.reportCount || 1,
              }),
            };

            await this.emailTransporter.sendMail(mailOptions);
            this.logger.log(`✅ Email sent to admin: ${adminEmail}`);
          }
        } catch (emailError: any) {
          this.logger.error(`Failed to send report email: ${emailError.message}`);
          // Don't throw - email failure shouldn't break report submission
        }
      }

      return {
        success: true,
        message: 'Report submitted successfully',
        reportId: report.reportId,
      };
    } catch (error: any) {
      this.logger.error(`Error submitting report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-disable ad when it reaches 10 reports
   */
  async autoDisableAd(adId: string, reason: string): Promise<void> {
    try {
      this.logger.warn(`Auto-disabling ad ${adId}: ${reason}`);

      await this.adModel.findOneAndUpdate(
        { adId },
        {
          $set: {
            autoDisabled: true,
            disabledAt: new Date(),
            disabledReason: reason,
            status: 'expired', // Mark as expired so it won't show in listings
          },
        },
      ).exec();

      // Get ad owner to notify
      const ad = await this.adModel.findOne({ adId }).select('userId title').exec();
      
      if (ad && this.kafkaService) {
        await this.kafkaService.emit(KAFKA_TOPICS.AD_AUTO_DISABLED, {
          adId,
          userId: ad.userId,
          adTitle: ad.title,
          reason,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      this.logger.error(`Error auto-disabling ad: ${error.message}`);
    }
  }

  /**
   * Get all reports for a specific ad (admin only)
   */
  async getAdReports(adId: string): Promise<any[]> {
    try {
      this.logger.log(`Fetching enriched reports for ad: ${adId}`);

      const reports = await this.reportModel.aggregate([
        { $match: { adId } },
        { $lookup: {
            from: 'ads',
            localField: 'adId',
            foreignField: 'adId',
            as: 'ad',
        }},
        { $unwind: { path: '$ad', preserveNullAndEmptyArrays: true } },
        // Convert ad.userId (string) to ObjectId for user lookup
        { $addFields: {
            adUserObjectId: {
              $cond: [
                { $regexMatch: { input: '$ad.userId', regex: /^[0-9a-fA-F]{24}$/ } },
                { $toObjectId: '$ad.userId' },
                null
              ]
            },
            adUserIdString: '$ad.userId'
        }},
        // Lookup uploader (user or merchant) by _id
        { $lookup: {
            from: 'users',
            let: { adUserObjectId: '$adUserObjectId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$adUserObjectId'] } } },
            ],
            as: 'uploader',
        }},
        { $unwind: { path: '$uploader', preserveNullAndEmptyArrays: true } },
        // Lookup all active ads for this uploader to count listings
        { $lookup: {
            from: 'ads',
            let: { uploaderUserId: '$uploader._id' },
            pipeline: [
              { $match: { $expr: { $and: [ { $eq: [ { $toObjectId: '$userId' }, '$$uploaderUserId' ] }, { $eq: ['$status', 'active'] } ] } } },
            ],
            as: 'uploaderActiveAds',
        }},
        { $addFields: {
            uploader: {
              $cond: [
                { $ifNull: ['$uploader.userId', false] },
                '$uploader',
                {
                  $cond: [
                    { $ifNull: ['$adUserIdString', false] },
                    { name: 'No user info', accountType: '-', role: '-', email: '-', userId: '$adUserIdString' },
                    { name: 'No user info', accountType: '-', role: '-', email: '-', userId: '-' }
                  ]
                }
              ]
            },
            uploaderListingCount: { $size: { $ifNull: ['$uploaderActiveAds', []] } },
        }},
        { $project: {
            reportId: 1,
            adId: 1,
            reportedBy: 1,
            reason: 1,
            description: 1,
            status: 1,
            adminNotes: 1,
            createdAt: 1,
            reviewedAt: 1,
            // Ad details
            'ad.title': 1,
            'ad.price': 1,
            'ad.category': 1,
            'ad.subCategory': 1,
            'ad.images': 1,
            'ad.status': 1,
            'ad.reportCount': 1,
            'ad.userId': 1,
            // Uploader details
            'uploader.name': 1,
            'uploader.accountType': 1,
            'uploader.role': 1,
            'uploader.email': 1,
            'uploader.userId': 1,
            uploaderListingCount: 1,
        }},
        { $sort: { createdAt: -1 } },
      ]);

      return reports;
    } catch (error: any) {
      this.logger.error(`Error fetching enriched reports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all reports queue (admin only) - shows all reports regardless of status
   */
  async getAllReports(): Promise<any[]> {
    try {
      this.logger.log('🔍 Fetching all reports queue from database');

      // First, check if any reports exist
      const totalCount = await this.reportModel.countDocuments().exec();
      this.logger.log(`📊 Total reports in database: ${totalCount}`);

      if (totalCount === 0) {
        this.logger.warn('⚠️ No reports found in database');
        return [];
      }

      const reports = await this.reportModel.aggregate([
        { $match: {} },
        { $lookup: {
            from: 'ads',
            localField: 'adId',
            foreignField: 'adId',
            as: 'ad',
        }},
        { $unwind: { path: '$ad', preserveNullAndEmptyArrays: false } }, // Only keep if ad exists
        { $match: { 'ad.status': { $nin: ['deleted', 'hidden'] } } }, // Exclude deleted/hidden ads
        { $project: {
            reportId: 1,
            adId: 1,
            reportedBy: 1,
            reason: 1,
            description: 1,
            status: 1,
            adminNotes: 1,
            createdAt: 1,
            reviewedAt: 1,
            'ad.title': 1,
            'ad.status': 1,
            'ad.reportCount': 1,
        }},
        { $sort: { createdAt: -1 } },
      ]);

      this.logger.log(`✅ Successfully fetched ${reports.length} reports with ad details (excluding deleted/hidden/missing ads)`);
      return reports;
    } catch (error: any) {
      this.logger.error(`❌ Error fetching reports: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update report status (admin only)
   */
  async updateReportStatus(
    reportId: string,
    status: ReportStatus,
    adminNotes?: string,
    reviewerId?: string,
    reviewerEmail?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Updating report ${reportId} status to: ${status}`);

      const report = await this.reportModel.findOneAndUpdate(
        { reportId },
        {
          $set: {
            status,
            adminNotes: adminNotes || '',
            reviewedAt: new Date(),
            reviewedBy: reviewerId || '',
          },
        },
        { new: true },
      ).exec();

      if (!report) {
        throw new NotFoundException('Report not found');
      }

      if (reviewerId && reviewerEmail) {
        await this.auditLogsService.log({
          action: 'REPORT_STATUS_UPDATED',
          adminId: reviewerId,
          adminEmail: reviewerEmail,
          targetId: reportId,
          targetType: 'Report',
          details: { newStatus: status, adminNotes }
        });
      }

      return {
        success: true,
        message: 'Report status updated successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error updating report status: ${error.message}`);
      throw error;
    }
  }

  async getMerchantReports(
    merchantId: string,
    status?: ReportStatus,
  ): Promise<any[]> {
    const ads = await this.adModel
      .find({ userId: String(merchantId) })
      .select('adId title status reportCount')
      .lean()
      .exec();

    const adIds = ads.map((ad: any) => ad.adId).filter(Boolean);
    if (!adIds.length) {
      return [];
    }

    const filter: any = { adId: { $in: adIds } };
    if (status) {
      filter.status = status;
    }

    const reports = await this.reportModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const adMap = new Map<string, any>();
    ads.forEach((ad: any) => {
      adMap.set(ad.adId, ad);
    });

    return reports.map((report: any) => {
      const ad = adMap.get(report.adId);
      return {
        ...report,
        adTitle: ad?.title || 'Unknown listing',
        adStatus: ad?.status || 'unknown',
        adReportCount: ad?.reportCount || 0,
      };
    });
  }

  async updateMerchantReportStatus(
    reportId: string,
    status: ReportStatus,
    merchantId: string,
    adminNotes?: string,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportModel.findOne({ reportId }).lean().exec();
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const ad = await this.adModel.findOne({ adId: report.adId }).lean().exec();
    if (!ad || String(ad.userId) !== String(merchantId)) {
      throw new ForbiddenException('You can only update reports for your own ads');
    }

    await this.reportModel
      .findOneAndUpdate(
        { reportId },
        {
          $set: {
            status,
            adminNotes: adminNotes || '',
            reviewedAt: new Date(),
            reviewedBy: merchantId,
          },
        },
      )
      .exec();

    return {
      success: true,
      message: 'Report status updated successfully',
    };
  }

  /**
   * Admin review of flagged ad
   */
  async reviewAd(
    adId: string,
    decision: 'approve' | 'remove' | 'request_changes',
    adminNotes?: string,
    reviewerId?: string,
    reviewerEmail?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Admin reviewing ad ${adId}, decision: ${decision}`);

      // Update ad based on decision
      const updateData: any = {
        isUnderReview: false,
        reviewedBy: reviewerId || '',
        reviewedAt: new Date(),
      };

      if (decision === 'approve') {
        updateData.status = 'active';
        updateData.autoDisabled = false;
        updateData.disabledReason = '';
      } else if (decision === 'remove') {
        updateData.status = 'deleted';
        updateData.rejectionReason = adminNotes || 'Removed by admin after review';
      } else if (decision === 'request_changes') {
        updateData.status = 'pending';
        updateData.rejectionReason = adminNotes || 'Changes requested by admin';
      }

      await this.adModel.findOneAndUpdate({ adId }, { $set: updateData }).exec();

      // Mark all pending reports for this ad as action_taken
      await this.reportModel.updateMany(
        { adId, status: ReportStatus.PENDING },
        {
          $set: {
            status: ReportStatus.ACTION_TAKEN,
            reviewedAt: new Date(),
            reviewedBy: reviewerId || '',
          },
        },
      ).exec();

      if (reviewerId && reviewerEmail) {
        await this.auditLogsService.log({
          action: 'AD_REVIEW_DECISION',
          adminId: reviewerId,
          adminEmail: reviewerEmail,
          targetId: adId,
          targetType: 'Ad',
          details: { decision, adminNotes }
        });
      }

      return {
        success: true,
        message: `Ad ${decision === 'approve' ? 'approved' : decision.replace('_', ' ')} successfully`,
      };
    } catch (error: any) {
      this.logger.error(`Error reviewing ad: ${error.message}`);
      throw error;
    }
  }

  /**
   * Recalculate report counts for all ads (utility)
   */
  async resyncReportCounts(): Promise<{ updated: number }> {
    try {
      this.logger.log('Resyncing report counts for all ads');

      const result = await this.reportModel.aggregate([
        {
          $group: {
            _id: '$adId',
            count: { $sum: 1 },
          },
        },
      ]);

      let updated = 0;
      for (const item of result) {
        await this.adModel.updateOne(
          { adId: item._id },
          { $set: { reportCount: item.count } },
        ).exec();
        updated++;
      }

      return { updated };
    } catch (error: any) {
      this.logger.error(`Error resyncing report counts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate HTML email for ad report notification
   */
  private generateReportEmailHTML(data: {
    adId: string;
    adTitle: string;
    reason: string;
    description?: string;
    reportedBy: string;
    reportCount: number;
  }): string {
    const urgencyColor = data.reportCount >= 10 ? '#dc2626' : data.reportCount >= 5 ? '#ea580c' : '#ca8a04';
    const urgencyText = data.reportCount >= 10 ? 'CRITICAL - Auto-Disabled' : data.reportCount >= 5 ? 'High Priority' : 'New Report';

    const emojis: Record<string, string> = {
      spam: '📢',
      inappropriate: '⚠️',
      fraud: '🚫',
      duplicate: '📋',
      other: '📝',
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .urgency-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; color: white; font-weight: bold; font-size: 12px; }
            .report-count { font-size: 32px; font-weight: bold; color: ${urgencyColor}; margin: 20px 0; }
            .detail-row { margin: 15px 0; padding: 15px; background: white; border-left: 4px solid ${urgencyColor}; border-radius: 5px; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            .value { margin-top: 5px; color: #1f2937; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Ad Reported for Review</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">GOLO Content Moderation System</p>
            </div>
            
            <div class="content">
              <div style="text-align: center;">
                <span class="urgency-badge" style="background: ${urgencyColor};">${urgencyText}</span>
                <div class="report-count">${data.reportCount} Report${data.reportCount !== 1 ? 's' : ''}</div>
              </div>

              <div class="detail-row">
                <div class="label">Ad Title</div>
                <div class="value"><strong>${data.adTitle}</strong></div>
                <div class="label" style="margin-top: 10px;">Ad ID</div>
                <div class="value"><code>${data.adId}</code></div>
              </div>

              <div class="detail-row">
                <div class="label">Report Reason</div>
                <div class="value" style="font-size: 18px; color: ${urgencyColor};">
                  ${emojis[data.reason] || '📝'} ${data.reason.charAt(0).toUpperCase() + data.reason.slice(1)}
                </div>
              </div>

              ${data.description ? `
                <div class="detail-row">
                  <div class="label">Reporter's Description</div>
                  <div class="value" style="font-style: italic;">"${data.description}"</div>
                </div>
              ` : ''}

              <div class="detail-row">
                <div class="label">Reported By (User ID)</div>
                <div class="value"><code>${data.reportedBy}</code></div>
              </div>

              <div style="text-align: center;">
                <a href="https://golo-frontend.vercel.app/admin/reports" class="button">
                  Review This Ad →
                </a>
              </div>

              ${data.reportCount >= 10 ? `
                <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px;">
                  <strong style="color: #dc2626;">⚠️ AUTO-DISABLED</strong>
                  <p style="margin: 10px 0 0 0; color: #991b1b; font-size: 14px;">
                    This ad has been automatically disabled due to reaching 10 reports. Please review immediately.
                  </p>
                </div>
              ` : ''}

              <div class="footer">
                <p>This is an automated notification from GOLO's content moderation system.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /* ============================================================
     ADMIN COUNT HELPERS (used by UsersService.adminGetStats)
  ============================================================ */

  async getPendingReportsCount(): Promise<number> {
    return this.reportModel.countDocuments({ status: ReportStatus.PENDING });
  }

  async getTotalAdsCount(): Promise<number> {
    return this.adModel.countDocuments();
  }

  async getTotalReportsCount(): Promise<number> {
    return this.reportModel.countDocuments();
  }

  async getCategoryManagementPublic(limit = 12): Promise<{
    summary: {
      totalCategories: number;
      activeCategories: number;
      subcategories: number;
      disabledHidden: number;
    };
    tree: Array<{ label: string; products: string[] }>;
    rows: Array<{
      name: string;
      parent: string;
      listings: number;
      status: 'Active' | 'Hidden';
      lastUpdated: string;
    }>;
    totalRows: number;
    updatedAt: string;
  }> {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 12));

    const [
      categoryValues,
      activeCategoryValues,
      subcategoryValues,
      treeAgg,
      listAgg,
      totalRowsAgg,
    ] = await Promise.all([
      this.adModel.distinct('category').exec(),
      this.adModel.distinct('category', { status: 'active' }).exec(),
      this.adModel.distinct('subCategory').exec(),
      this.adModel.aggregate([
        {
          $group: {
            _id: '$category',
            listings: { $sum: 1 },
            products: { $addToSet: '$subCategory' },
          },
        },
        { $sort: { listings: -1 } },
        { $limit: 6 },
        {
          $project: {
            _id: 0,
            label: '$_id',
            products: { $slice: ['$products', 8] },
          },
        },
      ]).exec(),
      this.adModel.aggregate([
        {
          $group: {
            _id: {
              category: '$category',
              subCategory: '$subCategory',
            },
            listings: { $sum: 1 },
            activeListings: {
              $sum: {
                $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
              },
            },
            lastUpdated: { $max: '$updatedAt' },
          },
        },
        { $sort: { listings: -1 } },
        { $limit: safeLimit },
        {
          $project: {
            _id: 0,
            name: '$_id.subCategory',
            parent: '$_id.category',
            listings: 1,
            status: {
              $cond: [{ $gt: ['$activeListings', 0] }, 'Active', 'Hidden'],
            },
            lastUpdated: {
              $ifNull: ['$lastUpdated', new Date()],
            },
          },
        },
      ]).exec(),
      this.adModel.aggregate([
        {
          $group: {
            _id: {
              category: '$category',
              subCategory: '$subCategory',
            },
          },
        },
        { $count: 'total' },
      ]).exec(),
    ]);

    const totalCategories = (categoryValues || []).filter(Boolean).length;
    const activeCategories = (activeCategoryValues || []).filter(Boolean).length;
    const subcategories = (subcategoryValues || []).filter(Boolean).length;
    const disabledHidden = Math.max(totalCategories - activeCategories, 0);

    return {
      summary: {
        totalCategories,
        activeCategories,
        subcategories,
        disabledHidden,
      },
      tree: Array.isArray(treeAgg) ? treeAgg : [],
      rows: Array.isArray(listAgg) ? listAgg : [],
      totalRows: totalRowsAgg?.[0]?.total || 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /* ============================================================
     VALIDATION
  ============================================================ */

  private validateCategoryData(category: string, data: any): void {
    if (!data) return;
  }
}
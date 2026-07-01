import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { randomInt } from 'crypto';
import { Voucher, VoucherStatus, VoucherDocument } from './schemas/voucher.schema';
import {
  BannerPromotionDocument,
  BannerPromotionType,
} from '../banners/schemas/banner-promotion.schema';
import { OfferPromotionDocument, OfferPromotionStatus } from '../offers/schemas/offer-promotion.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { MerchantDocument } from '../users/schemas/merchant.schema';
import { MerchantProduct, MerchantProductDocument } from '../merchant-products/schemas/merchant-product.schema';
import { OrdersService } from '../orders/orders.service';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class VouchersService implements OnModuleInit {
  private readonly logger = new Logger('VouchersService');
  private readonly legacyOfferCategorySet = new Set([
    'special',
    'festival',
    'limited time',
    'combo',
    'clearance',
  ]);

  private deriveProductStatus(stockQuantity: number): 'In Stock' | 'Low Stock' | 'Out of Stock' {
    if (stockQuantity <= 0) return 'Out of Stock';
    if (stockQuantity <= 10) return 'Low Stock';
    return 'In Stock';
  }

  constructor(
    @InjectModel('Voucher') private voucherModel: Model<VoucherDocument>,
    @InjectModel('BannerPromotion')
    private bannerModel: Model<BannerPromotionDocument>,
    @InjectModel('OfferPromotion')
    private offerModel: Model<OfferPromotionDocument>,
    @InjectModel('User') private userModel: Model<UserDocument>,
    @InjectModel('Merchant') private merchantModel: Model<MerchantDocument>,
    @InjectModel(MerchantProduct.name) private merchantProductModel: Model<MerchantProductDocument>,
    private ordersService: OrdersService,
    private redisService: RedisService,
  ) {}

  private getRedemptionRedisKey(merchantId: string) {
    return `merchant:redemptions:daily:${merchantId}`;
  }

  private async recordMerchantRedemption(merchantId: string, occurredAt = new Date()): Promise<void> {
    const redisClient = this.redisService.getClient();
    if (!redisClient || !merchantId) {
      return;
    }

    try {
      const dayKey = occurredAt.toISOString().slice(0, 10);
      const redisKey = this.getRedemptionRedisKey(merchantId);
      await redisClient.hIncrBy(redisKey, dayKey, 1);
      await redisClient.expire(redisKey, 60 * 60 * 24 * 60);
    } catch (error: any) {
      this.logger.error(`Failed to record merchant redemption for ${merchantId}: ${error.message}`);
    }
  }

  async onModuleInit() {
    console.log("--> VOUCHERS SERVICE onModuleInit START");
    try {
      // Clean legacy documents created while verificationCode defaulted to null.
      await this.voucherModel.updateMany(
        { verificationCode: null },
        { $unset: { verificationCode: 1 } },
      );
      console.log("--> VOUCHERS SERVICE updateMany DONE");
      const existingIndexes = await this.voucherModel.collection
        .listIndexes()
        .toArray();

      const verificationCodeIndex = existingIndexes.find(
        (index) => index.name === 'verificationCode_1',
      );

      const hasDesiredVerificationCodeIndex =
        Boolean(verificationCodeIndex?.unique) &&
        verificationCodeIndex?.partialFilterExpression?.verificationCode?.$type ===
          'string';

      if (!hasDesiredVerificationCodeIndex) {
        // Replace legacy sparse index with partial index (or create fresh if missing).
        if (verificationCodeIndex) {
          await this.voucherModel.collection.dropIndex('verificationCode_1');
        }

        await this.voucherModel.collection.createIndex(
          { verificationCode: 1 },
          {
            unique: true,
            partialFilterExpression: { verificationCode: { $type: 'string' } },
            name: 'verificationCode_1',
          },
        );
      }
    } catch (error) {
      if (error?.code === 86 || error?.codeName === 'IndexKeySpecsConflict') {
        this.logger.warn(
          'verificationCode_1 index already exists with a different definition; skipping index migration for this startup.',
        );
        return;
      }
      this.logger.error(`Error ensuring verification code index: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate alphanumeric code with specified format
   * @param groups - Number of groups (default: 3)
   * @param charsPerGroup - Characters per group (default: 4)
   * @param separator - Separator between groups (default: '-')
   * @returns Formatted code like: XXXX-XXXX-XXXX or ABC12-DEF34-GHI56-JKL78-MNO90 etc
   */
  private generateCode(
    groups: number = 3,
    charsPerGroup: number = 4,
    separator: string = '-',
  ): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const groupsList: string[] = [];

    for (let i = 0; i < groups; i++) {
      let group = '';
      for (let j = 0; j < charsPerGroup; j++) {
        // Use crypto.randomInt for cryptographically secure random selection
        const randomIndex = randomInt(0, chars.length);
        group += chars[randomIndex];
      }
      groupsList.push(group);
    }

    return groupsList.join(separator);
  }

  /**
   * Generate a unique verification code (wrapper for default format)
   * Format: XXXX-XXXX-XXXX (customizable via generateCode method)
   */
  private generateVerificationCode(): string {
    // Default: 3 groups of 4 chars with '-' separator
    return this.generateCode(3, 4, '-');
  }

  private async generateUniqueVerificationCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const verificationCode = this.generateVerificationCode();
      const existingVoucher = await this.voucherModel
        .exists({ verificationCode })
        .lean()
        .exec();

      if (!existingVoucher) {
        return verificationCode;
      }
    }

    throw new InternalServerErrorException(
      'Unable to generate a unique verification code',
    );
  }

  private async assertVoucherBelongsToMerchant(
    voucher: VoucherDocument,
    merchantId?: string,
  ): Promise<void> {
    if (!merchantId) {
      throw new BadRequestException('Merchant ID is required');
    }

    const currentMerchantId = String(merchantId);
    const allowedMerchantIds = new Set<string>([currentMerchantId]);

    // Legacy support: some old voucher rows may have merchant profile _id
    // instead of user id in merchantId.
    const merchantProfile = await this.merchantModel
      .findOne({ userId: currentMerchantId })
      .select('_id')
      .lean()
      .exec();

    if (merchantProfile?._id) {
      allowedMerchantIds.add(String(merchantProfile._id));
    }

    const offer = await this.bannerModel
      .findById(voucher.offerId)
      .select('merchantId')
      .lean()
      .exec();

    const offerMerchantId = String(offer?.merchantId || '');
    if (offerMerchantId) {
      allowedMerchantIds.add(offerMerchantId);
    }

    const voucherMerchantId = String(voucher.merchantId);
    if (allowedMerchantIds.has(voucherMerchantId)) {
      return;
    }

    // Self-heal legacy rows where voucher merchantId drifted from offer owner.
    if (offerMerchantId && allowedMerchantIds.has(offerMerchantId)) {
      try {
        voucher.merchantId = new Types.ObjectId(offerMerchantId);
        await voucher.save();
        return;
      } catch {
        // Ignore migration failures and fall through to forbidden response.
      }
    }

    if (!allowedMerchantIds.has(voucherMerchantId)) {
      throw new ForbiddenException('This voucher belongs to another merchant');
    }
  }

private isLikelyOffer(offer: {
    promotionType?: BannerPromotionType;
    bannerCategory?: string;
    bannerTitle?: string;
  }): boolean {
    if (offer?.promotionType === BannerPromotionType.OFFER) {
      return true;
    }

    if (offer?.promotionType) {
      return false;
    }

    const category = String(offer?.bannerCategory || '').trim().toLowerCase();
    if (this.legacyOfferCategorySet.has(category)) {
      return true;
    }

    const title = String(offer?.bannerTitle || '').trim().toLowerCase();
    return title.includes('offer') || title.includes('deal');
  }

  /**
   * Find offer from either BannerPromotion or OfferPromotion collection
   */
  private async findOfferById(offerId: string): Promise<{ offer: any; source: 'banner' | 'offer' } | null> {
    // Try BannerPromotion first
    const bannerOffer = await this.bannerModel.findById(offerId).lean().exec();
    if (bannerOffer) {
      return { offer: bannerOffer, source: 'banner' };
    }

    // Try OfferPromotion
    const offer = await this.offerModel.findById(offerId).lean().exec();
    if (offer) {
      return { offer, source: 'offer' };
    }

    return null;
  }

  /**
    * Claim an offer - User claims a deal and gets a voucher/QR code
    */
  async claimOffer(
    userId: string,
    offerId: string,
    claimLocation?: { latitude?: number; longitude?: number; location?: string },
  ) {
    try {
      if (!isValidObjectId(offerId)) {
        throw new NotFoundException('Offer not found');
      }

      // Find offer from either collection
      const offerResult = await this.findOfferById(offerId);
if (!offerResult) {
          throw new NotFoundException('Offer not found');
        }

      const offer = offerResult.offer;
      const isFromOfferCollection = offerResult.source === 'offer';

      // Check if voucher already claimed for this offer (any status - one claim per user per offer forever)
      const existingVoucher = await this.voucherModel.findOne({
        userId: new Types.ObjectId(userId),
        offerId: new Types.ObjectId(offerId),
      });

      if (existingVoucher) {
        throw new BadRequestException('You have already claimed this offer');
      }

      // Generate unique IDs
      const voucherId = `VOUCHER-${Date.now()}`;
      const qrCode = `voucher-${voucherId}-${offerId}`;

      // Generate QR code image with optimized settings for faster generation
      const qrImage = await QRCode.toDataURL(qrCode, {
        width: 200,  // Reduced from 300 for faster generation
        margin: 1,
        errorCorrectionLevel: 'M',  // Reduced from 'H' to 'M' for faster generation
        type: 'image/png',
        quality: 0.92,
      });

      const verificationCode = await this.generateUniqueVerificationCode();

      // Calculate expiry (30 days from now)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Get offer title and merchant info based on source
      const offerTitle = isFromOfferCollection 
        ? offer.title 
        : offer.bannerTitle;
      const merchantName = isFromOfferCollection
        ? offer.merchantName
        : offer.merchantName;
      const merchantId = isFromOfferCollection
        ? offer.merchantId
        : offer.merchantId;
      const category = isFromOfferCollection
        ? offer.category
        : offer.bannerCategory;
      const imageUrl = isFromOfferCollection
        ? offer.imageUrl
        : offer.imageUrl;
      const claimLatitude = Number(claimLocation?.latitude);
      const claimLongitude = Number(claimLocation?.longitude);
      const hasValidClaimCoordinates =
        Number.isFinite(claimLatitude) &&
        Number.isFinite(claimLongitude) &&
        claimLatitude >= -90 &&
        claimLatitude <= 90 &&
        claimLongitude >= -180 &&
        claimLongitude <= 180;

      // Create voucher
      const voucher = await this.voucherModel.create({
        userId: new Types.ObjectId(userId),
        offerId: new Types.ObjectId(offerId),
        voucherId,
        qrCode,
        verificationCode,
        qrImage,
        merchantId: new Types.ObjectId(String(merchantId)),
        offerTitle,
        merchantName,
        discount: category || 'Special Offer',
        offerImage: imageUrl,
        status: VoucherStatus.ACTIVE,
        claimedAt: new Date(),
        claimLocation: String(claimLocation?.location || '').trim(),
        claimLatitude: hasValidClaimCoordinates ? claimLatitude : null,
        claimLongitude: hasValidClaimCoordinates ? claimLongitude : null,
        expiresAt,
        validityHours: 720, // 30 days
      });

      // Create an order for the merchant when voucher is claimed
      try {
        const orderAmount = offer.totalPrice || 0;
        
        // Get merchant profile to find the correct userId for the order
        // The offer's merchantId might be the profile ID, but orders are filtered by user ID from JWT
        const merchantProfile = await this.merchantModel.findById(merchantId).select('userId').lean().exec();
        const orderMerchantId = merchantProfile?.userId || String(merchantId);
        
        await this.ordersService.createOrder(
          userId,
          orderMerchantId,
          orderAmount,
          1, // itemsCount
          voucher.voucherId, // Link order to voucher
        );
        this.logger.log(`Order created for voucher claim: ${voucher.voucherId}`);
      } catch (orderError) {
        // Log error but don't fail the voucher claim
        this.logger.error(`Failed to create order for voucher claim: ${orderError.message}`);
      }

      return {
        success: true,
        data: {
          _id: voucher._id,
          voucherId: voucher.voucherId,
          qrCode: voucher.qrCode,
          verificationCode,
          qrImage, // Data URL for display
          offerTitle: voucher.offerTitle,
          merchantName: voucher.merchantName,
          merchantId: voucher.merchantId,
          discount: voucher.discount,
          status: voucher.status,
          expiresAt: voucher.expiresAt,
          claimedAt: voucher.claimedAt,
        },
      };
    } catch (error) {
      this.logger.error(`Error claiming offer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate verification code on-demand when user reaches redeem page
   * This speeds up the claim process and generates the code only when needed
   */
  async generateVerificationCodeForVoucher(voucherId: string, merchantId: string) {
    try {
      const voucher = await this.voucherModel.findOne({ voucherId });

      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }

      await this.assertVoucherBelongsToMerchant(voucher, merchantId);

      // If verification code already exists, return it
      if (voucher.verificationCode) {
        return {
          success: true,
          data: {
            voucherId: voucher.voucherId,
            verificationCode: voucher.verificationCode,
          },
        };
      }

      // Generate new verification code
      const verificationCode = await this.generateUniqueVerificationCode();
      voucher.verificationCode = verificationCode;
      await voucher.save();

      return {
        success: true,
        data: {
          voucherId: voucher.voucherId,
          verificationCode: verificationCode,
        },
      };
    } catch (error) {
      this.logger.error(`Error generating verification code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all user's claimed vouchers with filtering
   */
  async getMyVouchers(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
  ) {
    try {
      const now = new Date();
      await this.voucherModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          status: { $in: [VoucherStatus.ACTIVE, VoucherStatus.CLAIMED] },
          expiresAt: { $lt: now },
        },
        { $set: { status: VoucherStatus.EXPIRED } },
      );

      const query: any = { userId: new Types.ObjectId(userId) };
      if (status) query.status = status;

      const skip = (page - 1) * limit;

      const vouchers = await this.voucherModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

      const total = await this.voucherModel.countDocuments(query);

      return {
        success: true,
        data: vouchers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching user vouchers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get single voucher details by ID
   */
  async getVoucherById(voucherId: string, userId?: string) {
    try {
      console.log(`[getVoucherById] Looking up voucher with ID: ${voucherId}`);
      
      let voucher;
      
      // Check if it's a MongoDB ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
        console.log(`[getVoucherById] Searching by MongoDB _id`);
        voucher = await this.voucherModel.findById(voucherId);
      } else {
        console.log(`[getVoucherById] Searching by voucherId field`);
        voucher = await this.voucherModel.findOne({ voucherId });
      }

      if (!voucher) {
        console.log(`[getVoucherById] Voucher not found for ID: ${voucherId}`);
        throw new NotFoundException('Voucher not found');
      }

      console.log(`[getVoucherById] Found voucher: ${voucher.voucherId}`);

      // Optional: Check if user owns this voucher
      if (userId && voucher.userId.toString() !== userId) {
        throw new ForbiddenException('You do not have access to this voucher');
      }

      // Backfill verification code only for legacy vouchers that do not have one yet.
      if (!voucher.verificationCode) {
        voucher.verificationCode = await this.generateUniqueVerificationCode();
        await voucher.save();
      }

      let qrImage = voucher.qrImage;

      // Backfill qrImage only for legacy vouchers that predate stored QR payloads.
      if (!qrImage) {
        qrImage = await QRCode.toDataURL(voucher.qrCode, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        voucher.qrImage = qrImage;
        await voucher.save();
      }

      return {
        success: true,
        data: {
          ...voucher.toObject(),
          qrImage,
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching voucher: ${error.message}`);
      throw error;
    }
  }

  async getPublicVoucherStatus(voucherId: string) {
    let voucher;

    if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
      voucher = await this.voucherModel.findById(voucherId).lean().exec();
    } else {
      voucher = await this.voucherModel.findOne({ voucherId }).lean().exec();
    }

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    return {
      success: true,
      data: {
        _id: String(voucher._id),
        voucherId: voucher.voucherId,
        status: voucher.status,
        redeemedAt: voucher.redeemedAt || null,
        expiresAt: voucher.expiresAt || null,
      },
    };
  }

  /**
   * Download voucher QR code as image
   */
  async downloadVoucherQR(voucherId: string, userId?: string) {
    try {
      console.log(`[downloadVoucherQR] Downloading QR for voucher: ${voucherId}`);
      
      let voucher;
      
      // Check if it's a MongoDB ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
        console.log(`[downloadVoucherQR] Searching by MongoDB _id`);
        voucher = await this.voucherModel.findById(voucherId);
      } else {
        console.log(`[downloadVoucherQR] Searching by voucherId field`);
        voucher = await this.voucherModel.findOne({ voucherId });
      }

      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }

      if (userId && voucher.userId.toString() !== userId) {
        throw new ForbiddenException('You do not have access to this voucher');
      }

      let qrImage = voucher.qrImage;

      if (!qrImage) {
        qrImage = await QRCode.toDataURL(voucher.qrCode, {
          width: 250,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        voucher.qrImage = qrImage;
        await voucher.save();
      }

      return {
        success: true,
        data: {
          voucherId: voucher.voucherId,
          qrImage,
          offerTitle: voucher.offerTitle,
          merchantName: voucher.merchantName,
        },
      };
    } catch (error) {
      this.logger.error(`Error downloading QR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Share voucher with friend via email
   */
  async shareVoucher(voucherId: string, friendEmail: string, userId: string) {
    try {
      console.log(`[shareVoucher] Sharing voucher: ${voucherId}`);
      
      let voucher;
      
      // Check if it's a MongoDB ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
        console.log(`[shareVoucher] Searching by MongoDB _id`);
        voucher = await this.voucherModel.findById(voucherId);
      } else {
        console.log(`[shareVoucher] Searching by voucherId field`);
        voucher = await this.voucherModel.findOne({ voucherId });
      }

      if (!voucher) {
        throw new NotFoundException('Voucher not found');
      }

      if (voucher.userId.toString() !== userId) {
        throw new ForbiddenException('You can only share your own vouchers');
      }

      // Update voucher with share info
      voucher.shareEmail = friendEmail;
      voucher.sharedAt = new Date();
      await voucher.save();

      // TODO: Send email to friend with voucher details
      // For now just return success
      // await this.emailService.sendVoucherShareEmail(friendEmail, voucher);

      return {
        success: true,
        message: 'Voucher shared successfully',
        data: {
          sharedWith: friendEmail,
          sharedAt: voucher.sharedAt,
        },
      };
    } catch (error) {
      this.logger.error(`Error sharing voucher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify voucher using verification code (manual entry)
   */
  async verifyVoucherByCode(verificationCode: string, merchantId?: string) {
    try {
      console.log(`[verifyVoucherByCode] Verifying code: ${verificationCode}`);
      
      // Search by verification code
      const voucher = await this.voucherModel.findOne({ verificationCode });
      console.log(`[verifyVoucherByCode] Found voucher:`, !!voucher);

      if (!voucher) {
        throw new BadRequestException('Invalid verification code');
      }

      await this.assertVoucherBelongsToMerchant(voucher, merchantId);

      console.log(`[verifyVoucherByCode] Voucher: ${voucher.voucherId}`);

      // Check if already redeemed
      if (voucher.status === VoucherStatus.REDEEMED) {
        return {
          success: false,
          valid: false,
          message: 'Voucher already redeemed',
          data: null,
        };
      }

      // Check if expired
      if (new Date() > voucher.expiresAt) {
        await this.voucherModel.findOneAndUpdate(
          { verificationCode },
          { status: VoucherStatus.EXPIRED },
        );

        return {
          success: false,
          valid: false,
          message: 'Voucher has expired',
          data: null,
        };
      }

      // Get user details
      const user = await this.userModel.findById(voucher.userId).select('name email');

      return {
        success: true,
        valid: true,
        data: {
          voucherId: voucher.voucherId,
          verificationCode: voucher.verificationCode,
          userName: user?.name || 'Unknown User',
          userEmail: user?.email || 'N/A',
          offerTitle: voucher.offerTitle,
          discount: voucher.discount,
          status: voucher.status,
          expiresAt: voucher.expiresAt,
          claimedAt: voucher.claimedAt,
        },
      };
    } catch (error) {
      console.error(`[verifyVoucherByCode] Error:`, error);
      this.logger.error(`Error verifying voucher by code: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to verify voucher: ${error.message}`);
    }
  }

  /**
   * Verify voucher using QR code without redeeming
   */
  async verifyVoucher(voucherId: string, qrCode: string, merchantId?: string) {
    try {
      console.log(`[verifyVoucher] Starting verification for voucherId: ${voucherId}, qrCode: ${qrCode.substring(0, 50)}...`);

      // Search by voucherId field, not by MongoDB _id
      const voucher = await this.voucherModel.findOne({ voucherId });
      console.log(`[verifyVoucher] Found voucher:`, !!voucher);

      if (!voucher) {
        console.log(`[verifyVoucher] Voucher not found with voucherId: ${voucherId}`);
        throw new BadRequestException('Voucher not found');
      }

      await this.assertVoucherBelongsToMerchant(voucher, merchantId);

      console.log(`[verifyVoucher] Voucher QR code in DB: ${voucher.qrCode}`);
      console.log(`[verifyVoucher] Scanned QR code: ${qrCode}`);
      console.log(`[verifyVoucher] QR codes match: ${voucher.qrCode === qrCode}`);

      if (voucher.qrCode !== qrCode) {
        throw new BadRequestException('Invalid QR code');
      }

      // Check if already redeemed
      if (voucher.status === VoucherStatus.REDEEMED) {
        return {
          success: false,
          valid: false,
          message: 'Voucher already redeemed',
          data: null,
        };
      }

      // Check if expired
      if (new Date() > voucher.expiresAt) {
        // Update status if expired
        await this.voucherModel.findOneAndUpdate(
          { voucherId },
          { status: VoucherStatus.EXPIRED },
        );

        return {
          success: false,
          valid: false,
          message: 'Voucher has expired',
          data: null,
        };
      }

      // Get user details
      console.log(`[verifyVoucher] Looking up user with ID: ${voucher.userId}`);
      const user = await this.userModel.findById(voucher.userId).select('name email');
      console.log(`[verifyVoucher] User found:`, !!user);

      const response = {
        success: true,
        valid: true,
        data: {
          voucherId: String(voucher.voucherId),
          userName: user?.name ? String(user.name) : 'Unknown User',
          userEmail: user?.email ? String(user.email) : 'N/A',
          offerTitle: String(voucher.offerTitle),
          discount: String(voucher.discount),
          status: String(voucher.status),
          expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt).toISOString() : null,
          claimedAt: voucher.claimedAt ? new Date(voucher.claimedAt).toISOString() : null,
        },
      };

      console.log(`[verifyVoucher] Returning response:`, response);
      return response;
    } catch (error) {
      console.error(`[verifyVoucher] Error:`, error);
      this.logger.error(`Error verifying voucher: ${error.message}`, error.stack);

      // If it's already a BadRequestException or other NestJS exception, re-throw it
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }

      // Otherwise throw as internal server error with details
      throw new InternalServerErrorException(`Failed to verify voucher: ${error.message}`);
    }
  }

  /**
   * Merchant completes the redemption
   */
  async redeemVoucher(
    voucherId: string,
    qrCode?: string,
    merchantId?: string,
    verificationCode?: string,
  ) {
    try {
      // Support for both QR code and verification code
      // If only 3 params are passed and 3rd is merchantId, handle it
      let actualMerchantId = merchantId;
      let actualQrCode = qrCode;
      let actualVerificationCode = verificationCode;

      // For backward compatibility: if merchantId looks like a qrCode (contains dashes and is long), shift parameters
      if (merchantId && merchantId.length > 30 && merchantId.includes('-') && !verificationCode) {
        actualQrCode = merchantId;
        actualMerchantId = qrCode;
      }

      // Validate that at least one verification method is provided
      if (!actualQrCode && !actualVerificationCode) {
        throw new BadRequestException('QR code or verification code is required');
      }

      // Search by voucherId field, not by MongoDB _id
      const voucher = await this.voucherModel.findOne({ voucherId });

      if (!voucher) {
        throw new BadRequestException('Voucher not found');
      }

      await this.assertVoucherBelongsToMerchant(voucher, actualMerchantId);

      // Verify using the provided method
      if (actualQrCode) {
        if (voucher.qrCode !== actualQrCode) {
          throw new BadRequestException('Invalid QR code');
        }
      } else if (actualVerificationCode) {
        if (voucher.verificationCode !== actualVerificationCode) {
          throw new BadRequestException('Invalid verification code');
        }
      }

      // Check if already redeemed
      if (voucher.status === VoucherStatus.REDEEMED) {
        throw new BadRequestException('Voucher already redeemed');
      }

      // Check if expired
      if (new Date() > voucher.expiresAt) {
        voucher.status = VoucherStatus.EXPIRED;
        await voucher.save();
        throw new BadRequestException('Voucher has expired');
      }

      // Update voucher status
      const redemptionCode = `RDM-${Date.now()}`;
      voucher.status = VoucherStatus.REDEEMED;
      voucher.redeemedAt = new Date();
      voucher.redeemedByMerchantId = new Types.ObjectId(actualMerchantId);
      voucher.redemptionCode = redemptionCode;
      await voucher.save();

      // ── Auto-decrement stock for every product linked to the offer ──────────
      try {
        const offerId = String(voucher.offerId);

        // Fetch selectedProducts from OfferPromotion first, then BannerPromotion
        let selectedProducts: Array<{ productId?: string }> = [];

        const offerDoc = await this.offerModel
          .findById(offerId)
          .select('selectedProducts')
          .lean()
          .exec();

        if (offerDoc?.selectedProducts?.length) {
          selectedProducts = offerDoc.selectedProducts as Array<{ productId?: string }>;
        } else {
          const bannerDoc = await this.bannerModel
            .findById(offerId)
            .select('selectedProducts')
            .lean()
            .exec();
          if (bannerDoc?.selectedProducts?.length) {
            selectedProducts = bannerDoc.selectedProducts as Array<{ productId?: string }>;
          }
        }

        for (const item of selectedProducts) {
          const pid = item?.productId;
          if (!pid || !isValidObjectId(pid)) continue;

          // Atomically decrement stockQuantity (floor at 0) and refresh status
          const updated = await this.merchantProductModel
            .findOneAndUpdate(
              { _id: pid, stockQuantity: { $gt: 0 } },
              { $inc: { stockQuantity: -1 } },
              { new: true },
            )
            .exec();

          if (updated) {
            updated.status = this.deriveProductStatus(updated.stockQuantity);
            await updated.save();
            this.logger.log(
              `Stock decremented for product ${pid}: ${updated.stockQuantity + 1} → ${updated.stockQuantity} (${updated.status})`,
            );
          }
        }
      } catch (stockError) {
        // Never fail the redemption due to stock sync errors — log and continue
        this.logger.error(`Failed to decrement stock after redemption: ${stockError.message}`);
      }
      // ────────────────────────────────────────────────────────────────────────

      // Fetch offer to get loyaltyPointsPerPurchase
      let loyaltyPoints = 0;
      let offerMerchantId = null;
      // Try OfferPromotion first
      const offer = await this.offerModel.findById(voucher.offerId).lean();
      if (offer && offer.loyaltyRewardEnabled && offer.loyaltyPointsPerPurchase) {
        loyaltyPoints = Number(offer.loyaltyPointsPerPurchase) || 0;
        offerMerchantId = offer.merchantId;
      } else {
        // Fallback: Try BannerPromotion if not found in OfferPromotion
        const banner = await this.bannerModel.findById(voucher.offerId).lean();
        if (
          banner &&
          banner.loyaltyRewardEnabled &&
          banner.loyaltyStarsPerPurchase &&
          banner.loyaltyScorePerStar
        ) {
          loyaltyPoints = Number(banner.loyaltyStarsPerPurchase) * Number(banner.loyaltyScorePerStar) || 0;
          offerMerchantId = banner.merchantId;
        }
      }

       // Credit points to user
       if (loyaltyPoints > 0) {
         const user = await this.userModel.findById(voucher.userId);
         if (user) {
           // Add to total points
           user.loyaltyPoints = (user.loyaltyPoints || 0) + loyaltyPoints;
           // Add to per-merchant points (replace object to ensure change detection)
           const merchantIdStr = String(offerMerchantId || voucher.merchantId);
           const current = user.merchantLoyaltyPoints || {};
           user.merchantLoyaltyPoints = {
             ...current,
             [merchantIdStr]: (current[merchantIdStr] || 0) + loyaltyPoints,
           };
           await user.save();
         }
       }

      // Normalize merchant identifier to merchant userId (some rows use profile _id)
      const resolveMerchantUserId = async (candidateId?: string) => {
        if (!candidateId) return null;
        try {
          // If candidateId is a profile ObjectId, find profile.userId
          if (isValidObjectId(candidateId)) {
            const profile = await this.merchantModel.findById(candidateId).select('userId').lean().exec();
            if (profile?.userId) return String(profile.userId);
          }

          // Try to find merchant profile by userId field
          const profile2 = await this.merchantModel.findOne({ userId: candidateId }).select('userId').lean().exec();
          if (profile2?.userId) return String(profile2.userId);

          // Fallback: return the provided candidateId
          return candidateId;
        } catch (err) {
          return candidateId;
        }
      };

      const candidate = String(actualMerchantId || offerMerchantId || voucher.merchantId || '');
      const merchantUserId = (await resolveMerchantUserId(candidate)) || candidate;

      // Record redemption using normalized merchant user id so dashboard (which reads by user id) sees it
      await this.recordMerchantRedemption(String(merchantUserId));

      // Get user details (after update)
      const user = await this.userModel.findById(voucher.userId).select('name email loyaltyPoints merchantLoyaltyPoints');

      return {
        success: true,
        message: 'Voucher redeemed successfully',
        data: {
          voucherId: voucher.voucherId,
          userName: user?.name,
          offerTitle: voucher.offerTitle,
          discount: voucher.discount,
          redeemedAt: voucher.redeemedAt,
          redemptionCode: redemptionCode,
          loyaltyPointsCredited: loyaltyPoints,
          userTotalPoints: user?.loyaltyPoints || 0,
          merchantPoints: user?.merchantLoyaltyPoints || {},
        },
      };
    } catch (error) {
      this.logger.error(`Error redeeming voucher: ${error.message}`);
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get merchant's pending redemptions (to be redeemed)
   */
  async getMerchantPendingRedemptions(
    merchantId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    try {
      const query: any = {
        merchantId: new Types.ObjectId(merchantId),
        status: { $in: [VoucherStatus.ACTIVE, VoucherStatus.CLAIMED] },
      };

      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;

      const vouchers = await this.voucherModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ claimedAt: -1 })
        .exec();

      const total = await this.voucherModel.countDocuments(query);

      // Enrich with user data
      const enrichedVouchers = await Promise.all(
        vouchers.map(async (v) => {
          const user = await this.userModel
            .findById(v.userId)
            .select('name email');
          return {
            ...v.toObject(),
            userName: user?.name,
            userEmail: user?.email,
          };
        }),
      );

      return {
        success: true,
        data: enrichedVouchers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching merchant pending redemptions: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get merchant's redemption history (already redeemed)
   */
  async getMerchantRedemptionHistory(
    merchantId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    try {
      const query = {
        merchantId: new Types.ObjectId(merchantId),
        status: VoucherStatus.REDEEMED,
      };

      const skip = (page - 1) * limit;

      const vouchers = await this.voucherModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ redeemedAt: -1 })
        .exec();

      const total = await this.voucherModel.countDocuments(query);

      // Enrich with user data
      const enrichedVouchers = await Promise.all(
        vouchers.map(async (v) => {
          const user = await this.userModel
            .findById(v.userId)
            .select('name email');
          return {
            ...v.toObject(),
            userName: user?.name,
            userEmail: user?.email,
          };
        }),
      );

      return {
        success: true,
        data: enrichedVouchers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching merchant redemption history: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get all active offers for a merchant
   */
  async getMerchantOffers(
    merchantId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    try {
      // Get merchant's banners/offers from BannerPromotion
      const query: any = { merchantId, promotionType: BannerPromotionType.OFFER };
      if (status) query.status = status;

      const skip = (page - 1) * limit;

      const offers = await this.bannerModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

      const total = await this.bannerModel.countDocuments(query);

      // Enrich each offer with claim and redemption counts
      const enrichedOffers = await Promise.all(
        offers.map(async (offer) => {
          const claimsCount = await this.voucherModel.countDocuments({
            offerId: offer._id,
          });

          const redeemedCount = await this.voucherModel.countDocuments({
            offerId: offer._id,
            status: VoucherStatus.REDEEMED,
          });

          return {
            offerId: offer._id,
            offerTitle: offer.bannerTitle,
            discount: offer.bannerCategory,
            status: offer.status,
            createdAt: offer.createdAt,
            claimsCount,
            redeemedCount,
          };
        }),
      );

      return {
        success: true,
        data: enrichedOffers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching merchant offers: ${error.message}`);
      throw error;
    }
  }
}

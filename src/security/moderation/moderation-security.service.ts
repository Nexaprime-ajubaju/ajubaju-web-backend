import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { SecurityEventsService } from '../events/security-events.service';
import { MerchantModerationAttempt, MerchantModerationAttemptDocument } from '../schemas/merchant-moderation-attempt.schema';
import { SecurityEventType } from '../schemas/security-event.schema';
import { SecurityConfig } from '../config/security.config';
import { Merchant, MerchantDocument } from '../../users/schemas/merchant.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { OfferPromotion, OfferPromotionDocument } from '../../offers/schemas/offer-promotion.schema';

@Injectable()
export class ModerationSecurityService {
  constructor(
    private readonly securityEventsService: SecurityEventsService,
    @InjectModel(MerchantModerationAttempt.name)
    private readonly moderationAttemptModel: Model<MerchantModerationAttemptDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(OfferPromotion.name)
    private readonly offerModel: Model<OfferPromotionDocument>,
  ) {}

  async checkRestriction(merchantId: string, offerId?: string) {
    // merchantId parameter is actually the userId (User._id)
    const user = await this.userModel.findById(merchantId).exec();
    
    if (user?.security?.contentUploadRestrictionUntil) {
      if (user.security.contentUploadRestrictionUntil > new Date()) {
        throw new ForbiddenException({
          code: 'CONTENT_UPLOAD_RESTRICTED',
          message: 'All content image uploads are temporarily restricted due to repeated moderation failures.',
          restrictedUntil: user.security.contentUploadRestrictionUntil,
        });
      }
    }

    if (offerId && isValidObjectId(offerId)) {
      const offer = await this.offerModel.findOne({ _id: offerId, merchantId }).exec();
      if (offer?.security?.lockedUntil) {
        if (offer.security.lockedUntil > new Date()) {
          throw new ForbiddenException({
            code: 'OFFER_LOCKED',
            message: 'This offer has been temporarily locked due to repeated content moderation failures.',
            lockedUntil: offer.security.lockedUntil,
          });
        } else if (offer.security.failedImageModerations > 0) {
          // Lock has expired. Reset the counter.
          await this.offerModel.updateOne(
            { _id: offerId, merchantId },
            { $set: { 'security.failedImageModerations': 0, 'security.lockedUntil': null } }
          ).exec();
        }
      }
    }
  }

  async handleSuccess(merchantId: string, offerId?: string) {
    if (offerId && isValidObjectId(offerId)) {
      await this.offerModel.updateOne(
        { _id: offerId, merchantId, 'security.failedImageModerations': { $gt: 0 } },
        { $set: { 'security.failedImageModerations': 0, 'security.lockedUntil': null } }
      ).exec();
    }
  }

  async handleFailure(merchantId: string, offerId: string, imageHash: string, failureReason: string, context: 'single' | 'multi' = 'single') {
    const nowUTC = new Date();

    // 1. Log the failed attempt
    await this.moderationAttemptModel.create({
      merchantId,
      offerId,
      imageHash,
      failureReason,
      createdAt: nowUTC,
    });

    // 2. Offer-level lock (Level 1)
    let offerUpdate = null;
    if (offerId && isValidObjectId(offerId)) {
      offerUpdate = await this.offerModel.findOneAndUpdate(
        { _id: offerId, merchantId },
        { $inc: { 'security.failedImageModerations': 1 } },
        { new: true }
      ).exec();
    }

    let offerFailedCount = 1;
    if (offerUpdate && offerUpdate.security) {
      offerFailedCount = offerUpdate.security.failedImageModerations;
      
      if (offerFailedCount >= SecurityConfig.offerFailureLimit) {
        const lockedUntil = new Date(nowUTC.getTime() + SecurityConfig.offerLockHours * 3600000);
        await this.offerModel.updateOne(
          { _id: offerId, 'security.lockedUntil': { $not: { $gt: nowUTC } } },
          { $set: { 'security.lockedUntil': lockedUntil } }
        ).exec();

        await this.securityEventsService.logEvent({
          merchantId,
          offerId,
          eventType: SecurityEventType.OFFER_LOCKED,
          severity: 'HIGH',
          message: `Offer locked for ${SecurityConfig.offerLockHours} hours.`,
          metadata: { attemptNumber: offerFailedCount, restrictionHours: SecurityConfig.offerLockHours, imageHash, failureReason }
        });
      }
    }

    // 3. User-wide lock (Level 2)
    const user = await this.userModel.findById(merchantId).exec();
    
    let windowStart = new Date(nowUTC.getTime() - SecurityConfig.rollingWindowHours * 3600000);
    if (user?.security?.contentUploadRestrictionUntil && user.security.contentUploadRestrictionUntil > windowStart) {
      windowStart = user.security.contentUploadRestrictionUntil;
    }

    const merchantFailures24h = await this.moderationAttemptModel.countDocuments({
      merchantId, // This is still called merchantId in the attempt schema, but represents userId
      createdAt: { $gte: windowStart },
    }).exec();

    const failureLimit = context === 'multi' ? SecurityConfig.multiImageFailureLimit : SecurityConfig.singleImageFailureLimit;

    if (merchantFailures24h >= failureLimit) {
      const restrictionCount = (user?.security?.restrictionCount30Days || 0) + 1;
      
      const restrictionHoursIndex = Math.min(restrictionCount - 1, SecurityConfig.merchantRestrictionHours.length - 1);
      const restrictionHours = SecurityConfig.merchantRestrictionHours[restrictionHoursIndex];
      const restrictedUntil = new Date(nowUTC.getTime() + restrictionHours * 3600000);

      // Atomic update to avoid race conditions
      const updated = await this.userModel.findOneAndUpdate(
        { 
          _id: merchantId,
          $or: [
            { 'security.contentUploadRestrictionUntil': { $lt: nowUTC } },
            { 'security.contentUploadRestrictionUntil': null },
            { security: { $exists: false } }
          ]
        },
        { 
          $set: { 
            'security.contentUploadRestrictionUntil': restrictedUntil,
            'security.lastRestrictionAt': nowUTC
          },
          $inc: { 'security.restrictionCount30Days': 1 }
        },
        { new: true }
      ).exec();

      if (updated) {
        await this.securityEventsService.logEvent({
          merchantId,
          eventType: SecurityEventType.MERCHANT_RESTRICTED,
          severity: 'CRITICAL',
          message: `User content upload restricted for ${restrictionHours} hours.`,
          metadata: { attemptNumber: merchantFailures24h, restrictionHours, imageHash, failureReason }
        });

        throw new ForbiddenException({
          code: 'CONTENT_UPLOAD_RESTRICTED',
          message: 'All content image uploads are temporarily restricted due to repeated moderation failures.',
          restrictedUntil,
        });
      } else {
        // Already restricted by another thread
        const currentUser = await this.userModel.findById(merchantId).exec();
        if (currentUser?.security?.contentUploadRestrictionUntil && currentUser.security.contentUploadRestrictionUntil > nowUTC) {
          throw new ForbiddenException({
            code: 'CONTENT_UPLOAD_RESTRICTED',
            message: 'All content image uploads are temporarily restricted due to repeated moderation failures.',
            restrictedUntil: currentUser.security.contentUploadRestrictionUntil,
          });
        }
      }
    } else if (merchantFailures24h === failureLimit - 1) {
       throw new BadRequestException({
         code: 'FINAL_MODERATION_WARNING',
         message: "One more failed moderation attempt will temporarily disable image uploads.",
       });
    } else if (merchantFailures24h === failureLimit - 2) {
       throw new BadRequestException({
         code: 'MODERATION_WARNING',
         message: "Repeated uploads that violate GOLO's content policy may temporarily restrict your ability to upload images.",
       });
    }

    if (offerFailedCount >= SecurityConfig.offerFailureLimit) {
       throw new ForbiddenException({
          code: 'OFFER_LOCKED',
          message: 'This offer has been temporarily locked due to repeated content moderation failures.'
       });
    }
  }

  async getRiskScore(merchantId: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [recentFailures, recentRestrictions] = await Promise.all([
      this.moderationAttemptModel.countDocuments({
        merchantId,
        createdAt: { $gte: thirtyDaysAgo }
      }).exec(),
      this.userModel.findById(merchantId).select('security.restrictionCount30Days').exec(),
    ]);

    let score = 0;
    // 5 points per recent failure
    score += recentFailures * 5;
    
    // 50 points per restriction
    if (recentRestrictions?.security?.restrictionCount30Days) {
      score += recentRestrictions.security.restrictionCount30Days * 50;
    }

    return score;
  }
}

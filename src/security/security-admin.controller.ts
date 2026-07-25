import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecurityEvent, SecurityEventDocument } from './schemas/security-event.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { OfferPromotion, OfferPromotionDocument } from '../offers/schemas/offer-promotion.schema';
import { ModerationSecurityService } from './moderation/moderation-security.service';

// Assume you have an AdminGuard in your auth module. 
// For now, these are basic endpoints. Add AdminGuard as needed.
@Controller('admin/security')
export class SecurityAdminController {
  constructor(
    @InjectModel(SecurityEvent.name) private readonly securityEventModel: Model<SecurityEventDocument>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(OfferPromotion.name) private readonly offerModel: Model<OfferPromotionDocument>,
    private readonly moderationSecurityService: ModerationSecurityService,
  ) {}

  @Get('events')
  async getRecentEvents() {
    return this.securityEventModel.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
      {
        $lookup: {
          from: 'merchants',
          localField: 'merchantId',
          foreignField: 'userId',
          as: 'merchantDetails'
        }
      },
      {
        $unwind: {
          path: '$merchantDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          merchantObjectId: { 
            $convert: { input: '$merchantId', to: 'objectId', onError: null, onNull: null } 
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'merchantObjectId',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: true
        }
      }
    ]).exec();
  }

  @Get('restricted-merchants')
  async getRestrictedMerchants() {
    return this.merchantModel.find({
      'security.contentUploadRestrictionUntil': { $gt: new Date() }
    }).select('userId storeName storeEmail security').exec();
  }

  @Get('locked-offers')
  async getLockedOffers() {
    return this.offerModel.find({
      'security.lockedUntil': { $gt: new Date() }
    }).select('_id merchantId title security').exec();
  }

  @Get('merchants/:id/risk')
  async getMerchantRiskScore(@Param('id') merchantId: string) {
    const score = await this.moderationSecurityService.getRiskScore(merchantId);
    return { merchantId, riskScore: score };
  }
}

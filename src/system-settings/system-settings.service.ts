import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionService } from '../common/services/transaction.service';
import {
  SystemSettings,
  SystemSettingsDocument,
} from './schemas/system-settings.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import * as moment from 'moment';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
    @InjectModel(Merchant.name)
    private merchantModel: Model<MerchantDocument>,
    private readonly transactionService: TransactionService,
  ) {}

  async getSettings(): Promise<SystemSettings> {
    return this.transactionService.execute(async (session) => {
      let settings = await this.systemSettingsModel
        .findOne({ key: 'global' })
        .session(session)
        .exec();
      if (!settings) {
        this.logger.log(
          'Global settings not found, creating default settings.',
        );
        const createdSettings = await this.systemSettingsModel.create(
          [
            {
              key: 'global',
              merchantTrialDays: 50,
              freeTierMaxProducts: 10,
              freeTierMaxMonthlyOffersFirst2Months: 5,
              freeTierMaxMonthlyOffersAfter2Months: 2,
              freeTierMaxOfferDurationDays: 60,
              applyTrialChangesToExistingMerchants: false,
            },
          ],
          { session },
        );
        settings = createdSettings[0];
      }
      return settings;
    });
  }

  async updateSettings(
    updateDto: Partial<SystemSettings>,
  ): Promise<SystemSettings> {
    return this.transactionService.execute(async (session) => {
      const settings = await this.systemSettingsModel.findOneAndUpdate(
        { key: 'global' },
        { $set: updateDto },
        { new: true, upsert: true, session },
      );

      if (updateDto.applyTrialChangesToExistingMerchants) {
        const totalDays = (settings.merchantTrialDays || 0) + (settings.merchantTrialHours || 0) / 24 + (settings.merchantTrialMinutes || 0) / 1440;
        
        const merchants = await this.merchantModel.find({
           $or: [
             { 'subscription.status': 'TRIAL' },
             { subscription: { $exists: false } },
             { 'subscription.planId': 'Free Tier' }
           ]
        }).session(session);

        for (const merchant of merchants) {
            if (!merchant.subscription) {
               merchant.subscription = {
                   planId: 'Premium',
                   status: 'TRIAL',
                   startedAt: merchant.createdAt || new Date(),
                   expiresAt: null,
                   trialEndsAt: null,
                   billingCycle: 'monthly',
                   autoRenew: false,
                   assignedBy: 'system',
                   assignedAt: new Date()
               };
            }

            const startDate = merchant.subscription.startedAt || merchant.createdAt || new Date();
            const newTrialEndsAt = moment(startDate).add(totalDays, 'days').toDate();
            merchant.subscription.trialEndsAt = newTrialEndsAt;

            if (moment().isAfter(moment(newTrialEndsAt))) {
                merchant.subscription.status = 'ACTIVE';
                merchant.subscription.planId = 'Free Tier';
            } else {
                merchant.subscription.status = 'TRIAL';
                merchant.subscription.planId = 'Premium';
            }

            merchant.markModified('subscription');
            await merchant.save({ session });
        }
      }

      return settings;
    });
  }
}

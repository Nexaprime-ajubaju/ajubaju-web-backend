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
        const totalDays = (settings.merchantTrialDays || 0);
        const totalHours = (settings.merchantTrialHours || 0);
        const totalMinutes = (settings.merchantTrialMinutes || 0);
        const hasTrial = totalDays > 0 || totalHours > 0 || totalMinutes > 0;

        const merchants = await this.merchantModel.find({
           $or: [
             { 'subscription.status': 'TRIAL' },
             { subscription: { $exists: false } },
             { 'subscription.planId': 'Free Tier' }
           ]
        }).session(session);

        for (const merchant of merchants) {
            if (!hasTrial) {
              // No trial duration set — move to Free Tier immediately
              if (!merchant.subscription) merchant.subscription = {} as any;
              merchant.subscription.planId = 'Free Tier';
              merchant.subscription.status = 'ACTIVE';
              merchant.subscription.trialEndsAt = null;
            } else {
              // Reset trial from NOW so the merchant gets the FULL new duration
              const newTrialEndsAt = moment()
                .add(totalDays, 'days')
                .add(totalHours, 'hours')
                .add(totalMinutes, 'minutes')
                .toDate();

              if (!merchant.subscription) {
                merchant.subscription = {
                  planId: 'Premium',
                  status: 'TRIAL',
                  startedAt: new Date(),
                  expiresAt: null,
                  trialEndsAt: newTrialEndsAt,
                  billingCycle: 'monthly',
                  autoRenew: false,
                  assignedBy: 'system',
                  assignedAt: new Date()
                };
              } else {
                merchant.subscription.planId = 'Premium';
                merchant.subscription.status = 'TRIAL';
                merchant.subscription.startedAt = new Date();
                merchant.subscription.trialEndsAt = newTrialEndsAt;
              }
            }

            merchant.markModified('subscription');
            await merchant.save({ session });
        }
      }

      return settings;
    });
  }
}

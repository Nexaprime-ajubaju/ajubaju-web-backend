import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionService } from '../common/services/transaction.service';
import {
  SystemSettings,
  SystemSettingsDocument,
} from './schemas/system-settings.schema';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
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
      return settings;
    });
  }
}

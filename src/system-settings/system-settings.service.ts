import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemSettings, SystemSettingsDocument } from './schemas/system-settings.schema';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectModel(SystemSettings.name) private systemSettingsModel: Model<SystemSettingsDocument>,
  ) {}

  async getSettings(): Promise<SystemSettings> {
    let settings = await this.systemSettingsModel.findOne({ key: 'global' });
    if (!settings) {
      this.logger.log('Global settings not found, creating default settings.');
      settings = await this.systemSettingsModel.create({
        key: 'global',
        merchantTrialDays: 50,
        freeTierMaxProducts: 10,
        freeTierMaxMonthlyOffersFirst2Months: 5,
        freeTierMaxMonthlyOffersAfter2Months: 2,
        freeTierMaxOfferDurationDays: 60,
        applyTrialChangesToExistingMerchants: false,
      });
    }
    return settings;
  }

  async updateSettings(updateDto: Partial<SystemSettings>): Promise<SystemSettings> {
    const settings = await this.systemSettingsModel.findOneAndUpdate(
      { key: 'global' },
      { $set: updateDto },
      { new: true, upsert: true }
    );
    return settings;
  }
}

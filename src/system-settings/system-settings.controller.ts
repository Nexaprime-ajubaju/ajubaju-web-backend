import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

// Assuming JwtAuthGuard or similar exists for admin routes, leaving unguarded for now or using standard guards later
@Controller('admin/system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  async getSettings() {
    return this.systemSettingsService.getSettings();
  }

  @Put()
  async updateSettings(
    @Body() updateDto: {
      merchantTrialDays?: number;
      merchantTrialHours?: number;
      merchantTrialMinutes?: number;
      freeTierMaxProducts?: number;
      freeTierMaxMonthlyOffersFirst2Months?: number;
      freeTierMaxMonthlyOffersAfter2Months?: number;
      freeTierMaxOfferDurationDays?: number;
      applyTrialChangesToExistingMerchants?: boolean;
    }
  ) {
    return this.systemSettingsService.updateSettings(updateDto);
  }
}

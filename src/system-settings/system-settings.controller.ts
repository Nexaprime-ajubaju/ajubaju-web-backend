import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { SystemSettingsService } from './system-settings.service';

@Controller('admin/system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getSettings() {
    return this.systemSettingsService.getSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateSettings(
    @Body()
    updateDto: {
      merchantTrialDays?: number;
      merchantTrialHours?: number;
      merchantTrialMinutes?: number;
      freeTierMaxProducts?: number;
      freeTierMaxMonthlyOffersFirst2Months?: number;
      freeTierMaxMonthlyOffersAfter2Months?: number;
      freeTierMaxOfferDurationDays?: number;
      applyTrialChangesToExistingMerchants?: boolean;
    },
  ) {
    return this.systemSettingsService.updateSettings(updateDto);
  }
}

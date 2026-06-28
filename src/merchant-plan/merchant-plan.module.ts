import { Module } from '@nestjs/common';
import { MerchantPlanService } from './merchant-plan.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [MerchantPlanService],
  exports: [MerchantPlanService]
})
export class MerchantPlanModule {}

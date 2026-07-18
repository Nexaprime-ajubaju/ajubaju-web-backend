import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { TransactionModule } from '../common/services/transaction.module';
import {
  SystemSettings,
  SystemSettingsSchema,
} from './schemas/system-settings.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
      { name: Merchant.name, schema: MerchantSchema },
    ]),
  ],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}

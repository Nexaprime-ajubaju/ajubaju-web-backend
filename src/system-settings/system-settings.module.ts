import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettings, SystemSettingsSchema } from './schemas/system-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}

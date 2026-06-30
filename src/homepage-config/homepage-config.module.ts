import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HomepageConfig, HomepageConfigSchema } from './schemas/homepage-config.schema';
import { HomepageConfigController } from './homepage-config.controller';
import { HomepageConfigService } from './homepage-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HomepageConfig.name, schema: HomepageConfigSchema },
    ]),
  ],
  controllers: [HomepageConfigController],
  providers: [HomepageConfigService],
  exports: [HomepageConfigService],
})
export class HomepageConfigModule {}

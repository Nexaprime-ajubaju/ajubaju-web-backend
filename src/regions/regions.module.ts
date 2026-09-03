import { Module, forwardRef } from '@nestjs/common';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { BannersModule } from '../banners/banners.module';
import { AdsModule } from '../ads/ads.module';

import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    RedisModule,
    forwardRef(() => BannersModule),
    forwardRef(() => AdsModule),
  ],
  controllers: [RegionsController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}

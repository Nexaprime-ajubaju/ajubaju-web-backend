import { Module, forwardRef } from '@nestjs/common';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { BannersModule } from '../banners/banners.module';

@Module({
  imports: [forwardRef(() => BannersModule)],
  controllers: [RegionsController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}

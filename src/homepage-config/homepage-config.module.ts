import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HomepageConfig,
  HomepageConfigSchema,
} from './schemas/homepage-config.schema';
import { HomepageConfigController } from './homepage-config.controller';
import { HomepageConfigService } from './homepage-config.service';
import { TransactionModule } from '../common/services/transaction.module';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: HomepageConfig.name, schema: HomepageConfigSchema },
    ]),
    TransactionModule,
  ],
  controllers: [HomepageConfigController],
  providers: [HomepageConfigService],
  exports: [HomepageConfigService],
})
export class HomepageConfigModule {}

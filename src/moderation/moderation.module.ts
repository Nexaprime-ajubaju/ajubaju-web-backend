import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [RedisModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}

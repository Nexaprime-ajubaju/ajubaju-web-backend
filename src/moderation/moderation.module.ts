import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { TextModerationService } from './text-moderation.service';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [RedisModule],
  providers: [ModerationService, TextModerationService],
  exports: [ModerationService, TextModerationService],
})
export class ModerationModule {}

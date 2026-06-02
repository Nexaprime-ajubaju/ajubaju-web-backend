import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { AdsKafkaController } from './ads.kafka.controller';
import { Ad, AdSchema } from './schemas/category-schemas/ad.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Report, ReportSchema } from './schemas/report.schema';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ad.name, schema: AdSchema }]),
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    EventEmitterModule.forRoot(),
    forwardRef(() => KafkaModule),
    RedisModule, // Cache ad listings, search results, category listings
  ],
  controllers: [AdsController, AdsKafkaController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule { }

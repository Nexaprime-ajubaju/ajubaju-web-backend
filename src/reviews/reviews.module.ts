import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { Voucher, VoucherSchema } from '../vouchers/schemas/voucher.schema';
import { ReviewsKafkaController } from './reviews.kafka.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../common/services/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
      { name: Voucher.name, schema: VoucherSchema },
    ]),
    KafkaModule, // Review events, rating updates
    RedisModule, // Cache review listings, rating aggregates
  ],
  controllers: [ReviewsController, ReviewsKafkaController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

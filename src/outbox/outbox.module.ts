import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxEvent, OutboxEventSchema } from './schemas/outbox-event.schema';
import { OutboxService } from './outbox.service';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OutboxEvent.name, schema: OutboxEventSchema }]),
    ScheduleModule.forRoot(),
    KafkaModule,
  ],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}

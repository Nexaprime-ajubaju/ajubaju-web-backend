import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallsGateway } from './calls.gateway';
import { CallsKafkaController } from './calls.kafka.controller';
import { Call, CallSchema } from './schemas/call.schema';
import {
  Conversation,
  ConversationSchema,
} from '../chats/schemas/conversation.schema';
import { Message, MessageSchema } from '../chats/schemas/message.schema';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
    KafkaModule,
  ],
  controllers: [CallsController, CallsKafkaController],
  providers: [CallsService, CallsGateway],
  exports: [CallsService],
})
export class CallsModule {}

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogsService } from './audit-logs.service';
import { TransactionModule } from '../common/services/transaction.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsKafkaController } from './audit-logs.kafka.controller';
import { KafkaModule } from '../kafka/kafka.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    KafkaModule,
    TransactionModule,
  ],
  controllers: [AuditLogsController, AuditLogsKafkaController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}

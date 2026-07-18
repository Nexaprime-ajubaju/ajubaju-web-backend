import { Module, Global } from '@nestjs/common';
import { TransactionService } from './transaction.service';

@Global()
@Module({
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}

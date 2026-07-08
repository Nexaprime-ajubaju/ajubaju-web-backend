import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async execute<T>(
    work: (session: ClientSession) => Promise<T>,
    existingSession?: ClientSession,
  ): Promise<T> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      const shouldManageSession = !existingSession;
      const session = existingSession ?? (await this.connection.startSession());

      try {
        if (shouldManageSession) {
          session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          });
        }

        const result = await work(session);

        if (shouldManageSession) {
          await session.commitTransaction();
        }

        return result;
      } catch (error) {
        if (shouldManageSession && session.inTransaction()) {
          await session.abortTransaction();
        }

        if (
          this.isTransientTransactionError(error) &&
          retries < maxRetries - 1
        ) {
          retries += 1;
          this.logger.warn(
            `Transient transaction error caught. Retrying... (${retries}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, 50 * retries));
        } else {
          this.logger.error(
            `Transaction failed after ${retries} retries: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      } finally {
        if (shouldManageSession) {
          await session.endSession();
        }
      }
    }

    throw new Error(
      `Transaction failed after ${maxRetries} attempts due to unresolvable conflicts.`,
    );
  }

  private isTransientTransactionError(error: any): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const transientCodeNames = [
      'TransientTransactionError',
      'WriteConflict',
      'UnknownTransactionCommitResult',
    ];

    if (
      typeof error.codeName === 'string' &&
      transientCodeNames.includes(error.codeName)
    ) {
      return true;
    }

    if (typeof error.message === 'string') {
      return transientCodeNames.some((name) => error.message.includes(name));
    }

    return false;
  }
}

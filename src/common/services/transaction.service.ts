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
      let session: ClientSession | null = existingSession ?? null;

      try {
        if (shouldManageSession) {
          try {
            session = await this.connection.startSession();
            session.startTransaction({
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' },
            });
          } catch (sessionErr: any) {
            // If standalone local MongoDB without replica set, fall back to non-transaction execution
            this.logger.warn(
              'Standalone MongoDB detected (no replica set); executing operation without transaction session.',
            );
            return await work(null as any);
          }
        }

        const result = await work(session as ClientSession);

        if (shouldManageSession && session) {
          await session.commitTransaction();
        }

        return result;
      } catch (error: any) {
        if (shouldManageSession && session && session.inTransaction()) {
          try {
            await session.abortTransaction();
          } catch (e) {}
        }

        const isStandaloneError =
          error?.message?.includes('replica set member') ||
          error?.message?.includes('Transaction numbers') ||
          error?.code === 20;

        if (isStandaloneError) {
          this.logger.warn(
            'Standalone MongoDB detected (no replica set); executing operation without transaction session.',
          );
          return await work(null as any);
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
        if (shouldManageSession && session) {
          try {
            await session.endSession();
          } catch (e) {}
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

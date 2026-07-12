import { ForbiddenException } from '@nestjs/common';
import { MerchantProductsService } from './merchant-products.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TransactionService } from '../common/services/transaction.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

describe('MerchantProductsService resilience', () => {
  it('passes the active transaction session into plan usage checks', async () => {
    const session = createFakeSession() as any;
    const merchant = {
      userId: 'merchant-1',
      storeName: 'Test Store',
      storeEmail: 'store@example.com',
      createdAt: new Date(),
      trialEndDate: new Date(),
    } as any;

    const productModel = {
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      }),
    } as any;
    const offerModel = {
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      }),
    } as any;

    const systemSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        merchantTrialDays: 30,
        merchantTrialHours: 0,
        merchantTrialMinutes: 0,
        applyTrialChangesToExistingMerchants: true,
        freeTierMaxProducts: 10,
      }),
    } as unknown as SystemSettingsService;

    const planService = new SubscriptionsService(
      systemSettingsService,
      productModel,
      offerModel,
    );
    await planService.getPlanDetails(merchant, session);

    expect(productModel.countDocuments).toHaveBeenCalledWith(
      { merchantId: merchant.userId },
      { session },
    );
  });

  it('rejects product creation once the free-tier limit is reached inside the transaction', async () => {
    const session = createFakeSession() as any;
    const merchant = {
      userId: 'merchant-1',
      storeName: 'Test Store',
      storeEmail: 'store@example.com',
      createdAt: new Date(),
      trialEndDate: new Date(),
    } as any;

    const merchantProductModel = {
      countDocuments: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(10),
      }),
      create: jest.fn(),
    } as any;
    const merchantModel = {
      findOne: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(merchant),
      }),
    } as any;
    const SubscriptionsService = {
      getPlanDetails: jest
        .fn()
        .mockResolvedValue({ planFeatures: { maxProducts: 10 } }),
    } as any;
    const redisService = {
      isEnabled: jest.fn().mockReturnValue(false),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      deleteByPattern: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
    } as any;
    const transactionService = {
      execute: jest.fn(async (work: (session: any) => Promise<any>) =>
        work(session),
      ),
    } as unknown as TransactionService;

    const service = new MerchantProductsService(
      merchantProductModel,
      merchantModel,
      SubscriptionsService,
      redisService,
      transactionService,
      undefined,
    );

    await expect(
      service.create('merchant-1', {
        name: 'Product 1',
        category: 'Test',
        stockQuantity: 1,
        price: 100,
        description: 'desc',
        images: [],
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('retries transient transaction errors without committing duplicates', async () => {
    const session = createFakeSession() as any;
    const connection = {
      startSession: jest.fn().mockReturnValue(session),
    } as any;
    const transactionService = new TransactionService(connection);
    let attempts = 0;

    const result = await transactionService.execute(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw { codeName: 'TransientTransactionError' };
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  });
});

function createFakeSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
    inTransaction: jest.fn().mockReturnValue(true),
  };
}

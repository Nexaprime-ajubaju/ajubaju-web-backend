import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisService } from './common/services/redis.service';
import { getConnectionToken } from '@nestjs/mongoose';

describe('AppController', () => {
  let appController: AppController;

  const mockRedisService = {
    healthCheck: jest.fn().mockResolvedValue({ connected: false }),
    isEnabled: jest.fn().mockReturnValue(false),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
  };

  const mockConnection = {
    readyState: 1,
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return status ok', () => {
      expect(appController.checkHealth()).toEqual({ status: 'ok' });
    });
  });

  describe('health/ready', () => {
    it('should return readiness status', async () => {
      const result = await appController.checkReadiness();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
    });
  });
});

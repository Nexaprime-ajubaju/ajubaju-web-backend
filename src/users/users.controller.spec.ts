import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisService } from '../common/services/redis.service';

describe('UsersController', () => {
  let controller: UsersController;

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    isEnabled: jest.fn().mockReturnValue(false),
    healthCheck: jest.fn().mockResolvedValue({ connected: false }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            getProfile: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    controller = module.get(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

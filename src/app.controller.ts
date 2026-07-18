import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './common/services/redis.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  checkHealth(): any {
    return {
      status: 'ok',
    };
  }

  @Get('health/ready')
  async checkReadiness(): Promise<any> {
    const redisHealth = await this.redisService.healthCheck();

    // Mongoose readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const dbConnected = this.connection.readyState === 1;

    const isReady = redisHealth.connected && dbConnected;

    return {
      status: isReady ? 'ready' : 'not_ready',
      checks: {
        database: dbConnected ? 'up' : 'down',
        redis: redisHealth.connected ? 'up' : 'down',
        memory: 'ok',
        uptime: process.uptime(),
      },
      timestamp: new Date().toISOString(),
    };
  }
}

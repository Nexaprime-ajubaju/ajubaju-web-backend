import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: RedisClientType | null = null;
  private enabled: boolean = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get<{
      enabled?: boolean;
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      keyPrefix?: string;
    }>('config.redis');

    if (!redisConfig?.enabled) {
      this.logger.warn('Redis caching disabled by configuration');
      this.enabled = false;
      return;
    }

    try {
      const host = redisConfig.host || '127.0.0.1';
      const port = redisConfig.port || 6379;
      const password = redisConfig.password ? `:${encodeURIComponent(redisConfig.password)}@` : '';
      const db = Number.isInteger(redisConfig.db) ? redisConfig.db : 0;
      const url = `redis://${password}${host}:${port}/${db}`;

      this.redisClient = createClient({
        url,
      });

      this.redisClient.on('error', (error) => {
        this.logger.error(`Redis client error: ${error.message}`);
      });

      await this.redisClient.connect();
      await this.redisClient.ping();
      this.enabled = true;
      this.logger.log(`✅ Redis connected and ready at ${host}:${port}`);
    } catch (error: any) {
      this.logger.error(`❌ Redis connection failed: ${error.message}`);
      this.enabled = false;
      this.redisClient = null;
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error: any) {
        this.logger.error(`Redis disconnect failed: ${error.message}`);
      }
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): RedisClientType | null {
    if (!this.enabled || !this.redisClient) {
      this.logger.warn('Redis not enabled, returning null');
      return null;
    }
    return this.redisClient;
  }

  /**
   * Check if Redis is enabled and connected
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cache a value with TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      const ttl = ttlSeconds || Number(this.configService.get('REDIS_CACHE_TTL_DEFAULT')) || 300;
      await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error: any) {
      this.logger.error(`Cache SET failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get a cached value
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.redisClient) {
      return null;
    }

    try {
      const data = await this.redisClient.get(key);
      if (data === null) {
        this.logger.debug(`Cache MISS: ${key}`);
        return null;
      }
      this.logger.debug(`Cache HIT: ${key}`);
      if (typeof data === 'string') {
        try {
          return JSON.parse(data) as T;
        } catch {
          return data as T;
        }
      }
      return data as T;
    } catch (error: any) {
      this.logger.error(`Cache GET failed for ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a cached value
   */
  async del(key: string): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Cache DEL failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern using SCAN (non-blocking, production-safe).
   * NEVER use KEYS in production — it blocks Redis for the full scan duration.
   */
  async deleteByPattern(pattern: string): Promise<number> {
    if (!this.enabled || !this.redisClient) {
      return 0;
    }

    try {
      let deletedCount = 0;
      let cursor = '0';

      do {
        const reply = await this.redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = String(reply.cursor);
        const keys = reply.keys;

        if (keys.length > 0) {
          await this.redisClient.del(keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      this.logger.debug(`Cache SCAN-DEL pattern "${pattern}": deleted ${deletedCount} keys`);
      return deletedCount;
    } catch (error: any) {
      this.logger.error(`Cache SCAN-DEL failed for pattern "${pattern}": ${error.message}`);
      return 0;
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    if (!this.enabled || !this.redisClient) {
      return 0;
    }

    try {
      const result = await this.redisClient.incr(key);
      this.logger.debug(`Cache INCR: ${key} = ${result}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Cache INCR failed for ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Decrement a counter
   */
  async decr(key: string): Promise<number> {
    if (!this.enabled || !this.redisClient) {
      return 0;
    }

    try {
      const result = await this.redisClient.decr(key);
      this.logger.debug(`Cache DECR: ${key} = ${result}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Cache DECR failed for ${key}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      const result = await this.redisClient.exists(key);
      return result === 1;
    } catch (error: any) {
      this.logger.error(`Cache EXISTS failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.enabled || !this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.expire(key, seconds);
      return true;
    } catch (error: any) {
      this.logger.error(`Cache EXPIRE failed for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latency?: number;
    error?: string;
  }> {
    if (!this.enabled || !this.redisClient) {
      return { connected: false, error: 'Redis not configured' };
    }

    try {
      const start = Date.now();
      await this.redisClient.ping();
      const latency = Date.now() - start;
      return { connected: true, latency };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  }
}

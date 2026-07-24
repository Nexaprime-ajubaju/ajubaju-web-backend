import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHmac } from 'crypto';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BannerCacheService {
  private readonly logger = new Logger(BannerCacheService.name);
  private readonly HMAC_SECRET = process.env.BANNER_HMAC_SECRET || 'golo-banner-secret-key-2026';

  // In-Memory Fallback Store when Redis is disabled or offline
  private inMemorySlots: Map<string, Record<number, any>> = new Map();

  constructor(@Optional() private readonly redisService?: RedisService) {}

  private getCityKey(city: string): string {
    return `banner:city:${(city || 'global').trim().toLowerCase()}`;
  }

  /**
   * Generate SHA256 HMAC signed token for an impression slot
   */
  generateImpressionToken(requestId: string, slot: number, generation: number): string {
    const payload = `${requestId}:${slot}:${generation}`;
    return createHmac('sha256', this.HMAC_SECRET).update(payload).digest('hex');
  }

  /**
   * Verify HMAC impression token
   */
  verifyImpressionToken(requestId: string, slot: number, generation: number, token: string): boolean {
    if (!token) return false;
    const expected = this.generateImpressionToken(requestId, slot, generation);
    return expected === token;
  }

  /**
   * Set a specific slot in Redis Hash or In-Memory fallback
   */
  async setSlot(city: string, slotNumber: number, slotData: any): Promise<boolean> {
    const cityKey = (city || 'global').trim().toLowerCase();
    slotData.token = this.generateImpressionToken(slotData.requestId, slotNumber, slotData.generation);

    // Save to in-memory fallback store
    const currentMemory = this.inMemorySlots.get(cityKey) || {};
    currentMemory[slotNumber] = slotData;
    this.inMemorySlots.set(cityKey, currentMemory);

    if (!this.redisService || !this.redisService.isEnabled()) return true;
    const client = this.redisService.getClient();
    if (!client) return true;

    try {
      const key = this.getCityKey(city);
      const field = `slot${slotNumber}`;
      await client.hSet(key, field, JSON.stringify(slotData));
      await client.expire(key, 300);
      return true;
    } catch (err: any) {
      this.logger.error(`Error setting Redis slot ${slotNumber} for ${city}: ${err.message}`);
      return true;
    }
  }

  /**
   * Set all 9 slots in Redis Hash or In-Memory fallback
   */
  async setAllSlots(city: string, slotsData: Record<number, any>): Promise<boolean> {
    const cityKey = (city || 'global').trim().toLowerCase();

    const signedSlotsData: Record<number, any> = {};
    for (const [slotNum, data] of Object.entries(slotsData)) {
      const slotN = parseInt(slotNum, 10);
      data.token = this.generateImpressionToken(data.requestId, slotN, data.generation);
      signedSlotsData[slotN] = data;
    }

    // Save to in-memory fallback store
    this.inMemorySlots.set(cityKey, signedSlotsData);

    if (!this.redisService || !this.redisService.isEnabled()) return true;
    const client = this.redisService.getClient();
    if (!client) return true;

    try {
      const key = this.getCityKey(city);
      const hashFields: Record<string, string> = {};
      for (const [slotNum, data] of Object.entries(signedSlotsData)) {
        hashFields[`slot${slotNum}`] = JSON.stringify(data);
      }
      await client.hSet(key, hashFields);
      await client.expire(key, 300);
      return true;
    } catch (err: any) {
      this.logger.error(`Error setting all Redis slots for ${city}: ${err.message}`);
      return true;
    }
  }

  /**
   * Get all slots for a city from Redis Hash or In-Memory fallback
   */
  async getAllSlots(city: string): Promise<Record<number, any> | null> {
    const cityKey = (city || 'global').trim().toLowerCase();

    if (!this.redisService || !this.redisService.isEnabled()) {
      return this.inMemorySlots.get(cityKey) || null;
    }

    const client = this.redisService.getClient();
    if (!client) {
      return this.inMemorySlots.get(cityKey) || null;
    }

    try {
      const key = this.getCityKey(city);
      const hashData = await client.hGetAll(key);
      if (!hashData || Object.keys(hashData).length === 0) {
        return this.inMemorySlots.get(cityKey) || null;
      }

      const result: Record<number, any> = {};
      for (const [field, val] of Object.entries(hashData)) {
        const slotNum = parseInt(field.replace('slot', ''), 10);
        if (!isNaN(slotNum)) {
          result[slotNum] = JSON.parse(val);
        }
      }
      return result;
    } catch (err: any) {
      this.logger.error(`Error getting Redis slots for ${city}: ${err.message}`);
      return this.inMemorySlots.get(cityKey) || null;
    }
  }

  /**
   * Invalidate city slots cache
   */
  async invalidateCityCache(city: string): Promise<void> {
    const cityKey = (city || 'global').trim().toLowerCase();
    this.inMemorySlots.delete(cityKey);

    if (!this.redisService || !this.redisService.isEnabled()) return;
    const client = this.redisService.getClient();
    if (!client) return;

    try {
      const key = this.getCityKey(city);
      await client.del(key);
    } catch (err: any) {
      this.logger.error(`Error invalidating city cache for ${city}: ${err.message}`);
    }
  }
}

// Clear Redis cache for recommendations
const redis = require('redis');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

const client = redis.createClient({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  db: parseInt(process.env.REDIS_DB || '0', 10),
});

client.on('error', (err) => console.error('Redis Client Error:', err));

async function clearCache() {
  await client.connect();
  const pattern = 'reco:deals:v2:user:*'; // Updated cache key pattern
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    await client.del(keys);
    console.log(`Cleared ${keys.length} cache keys matching ${pattern}`);
  } else {
    console.log('No cache keys found');
  }
  await client.quit();
}

clearCache().catch(console.error);

const redis = require('redis');
const client = redis.createClient({ host: '127.0.0.1', port: 6379 });

client.connect().then(async () => {
  console.log('Clearing Redis cache...');
  const keys = await client.keys('reco:*');
  console.log(`Found ${keys.length} recommendation cache keys`);
  
  if (keys.length > 0) {
    await client.del(keys);
    console.log(`✅ Deleted ${keys.length} keys`);
  } else {
    console.log('No cache keys to delete');
  }
  
  await client.quit();
  console.log('Cache cleared!');
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

const { createClient } = require('redis');

async function run() {
  const redis = createClient();
  await redis.connect();
  await redis.del('banner:slots:kolhapur');
  console.log('Cleared redis slots for kolhapur');
  process.exit(0);
}

run().catch(console.error);

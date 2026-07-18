const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(); 

    // Find the test user
    const user = await db.collection('users').findOne({ email: 'testuser@example.com' });
    if (!user) {
      console.log('Test user not found!');
      return;
    }
    const userId = String(user._id);

    // Find 15 active ads/products
    const products = await db.collection('ads').find({ status: 'active' }).limit(15).toArray();
    if (products.length < 15) {
      console.log('Not enough products to simulate full activity.');
      return;
    }

    const events = [];
    const now = new Date();

    // 1. Recently Viewed (4+ view events)
    for (let i = 0; i < 5; i++) {
      events.push({
        version: 1,
        userId,
        strategy: 'homepage',
        productId: String(products[i]._id),
        eventType: 'view',
        createdAt: new Date(now.getTime() - i * 1000 * 60)
      });
    }

    // 2. Continue Shopping (4+ add_to_cart events without purchase)
    for (let i = 5; i < 10; i++) {
      events.push({
        version: 1,
        userId,
        strategy: 'homepage',
        productId: String(products[i]._id),
        eventType: 'add_to_cart',
        createdAt: new Date(now.getTime() - i * 1000 * 60)
      });
    }

    // 3. Repeat Purchase (4+ purchase events)
    for (let i = 10; i < 15; i++) {
      events.push({
        version: 1,
        userId,
        strategy: 'homepage',
        productId: String(products[i]._id),
        eventType: 'purchase',
        createdAt: new Date(now.getTime() - i * 1000 * 60 * 24 * 10) // 10 days ago
      });
    }

    // Insert events
    await db.collection('recommendationevents').insertMany(events);
    console.log(`Successfully seeded ${events.length} events for user testuser@example.com (${userId})`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

run();

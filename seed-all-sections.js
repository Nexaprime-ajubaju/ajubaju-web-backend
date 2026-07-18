const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();

    const user = await db.collection('users').findOne({ email: 'testuser@example.com' });
    if (!user) {
        console.error('Test user not found');
        return;
    }
    const userId = String(user._id);

    const ads = await db.collection('ads').find({ status: 'active' }).limit(20).toArray();
    const adIds = ads.map(a => String(a._id));

    // 1. NEARBY: update 10 products with locationCoordinates near [72.8316, 19.0505] (Mumbai)
    await db.collection('ads').updateMany(
      { _id: { $in: ads.slice(0, 10).map(a => a._id) } },
      { $set: { locationCoordinates: { type: 'Point', coordinates: [72.8316, 19.0505] } } }
    );
    console.log('Updated nearby products');

    // 2. INTEREST: insert a user profile
    await db.collection('userprofiles').deleteMany({ userId });
    await db.collection('userprofiles').insertOne({
      userId,
      confidence: 0.9,
      categories: { 'Electronics & Home appliances': 0.9, 'Mobiles': 0.8 },
      tags: { 'bestseller': 0.9 },
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    console.log('Inserted interest profile');

    // 3. SIMILAR CUSTOMERS: insert offline collection
    await db.collection('similar_customers').deleteMany({ userId });
    await db.collection('similar_customers').insertOne({
      userId,
      similarity: 0.95,
      recommendedProductIds: adIds.slice(5, 15),
      createdAt: new Date(),
    });
    console.log('Inserted similar customers');

    // 4. TRENDING: insert offline collection
    await db.collection('trending_products').deleteMany({ geohash: 'global' });
    await db.collection('trending_products').insertOne({
      geohash: 'global',
      recommendedProductIds: adIds.slice(0, 10),
      createdAt: new Date(),
    });
    console.log('Inserted trending products');

    console.log('Done! All sections should now be visible.');
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
  }
}
run();

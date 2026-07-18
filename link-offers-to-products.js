const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();

    // 1. Fetch some active real products
    const ads = await db.collection('ads').find({ status: 'active' }).limit(10).toArray();
    if (ads.length === 0) {
      console.log('No active products found to link to offers.');
      return;
    }

    // 2. Fetch all test offers
    const offers = await db.collection('offers').find({}).toArray();
    if (offers.length === 0) {
      console.log('No offers found.');
      return;
    }

    // 3. Link them
    let adIndex = 0;
    for (const offer of offers) {
      if (offer.selectedProducts && offer.selectedProducts.length > 0) {
        const updatedProducts = offer.selectedProducts.map(p => {
          const ad = ads[adIndex % ads.length];
          adIndex++;
          return {
            ...p,
            productId: String(ad._id),
            productName: ad.title,
            imageUrl: ad.imageUrl || ad.images?.[0] || p.imageUrl
          };
        });
        
        await db.collection('offers').updateOne(
          { _id: offer._id },
          { $set: { selectedProducts: updatedProducts } }
        );
      }
    }

    console.log('Successfully linked real products to test offers!');
  } catch (error) {
    console.error('Error linking products:', error);
  } finally {
    await client.close();
  }
}

run();

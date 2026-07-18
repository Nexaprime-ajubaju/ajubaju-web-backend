const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(); // uses default db from URI
    
    // Find 10 active ads
    const adsToUpdate = await db.collection('ads').find({ status: 'active' }).limit(10).toArray();
    
    if (adsToUpdate.length === 0) {
      console.log('No active ads found!');
      return;
    }

    const adIds = adsToUpdate.map(ad => ad._id);

    // Update them to have discountPercent and isPromoted
    const result = await db.collection('ads').updateMany(
      { _id: { $in: adIds } },
      { 
        $set: { 
          discountPercent: 20, 
          isPromoted: true,
          originalPrice: 1000,
          price: 800
        } 
      }
    );

    console.log(`Successfully updated ${result.modifiedCount} ads to have discounts for Flash Deals!`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

run();

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkDealsCategories() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://atharvapugade:iJk4Hn5CjWn5m03T@cluster0.z2i2t.mongodb.net/GOLO?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    let dbName = 'test';
    if (uri.includes('GOLO')) {
       dbName = 'GOLO';
    }
    const db = client.db(dbName);
    
    // Check offers distinct categories
    const offerCategories = await db.collection('offers').distinct('category');
    console.log("Distinct categories in offers:", offerCategories);

    const offerBusinessCategories = await db.collection('offers').distinct('businessCategory');
    console.log("Distinct businessCategory in offers:", offerBusinessCategories);

    // Check banner_promotions distinct categories
    const bannerCategories = await db.collection('banner_promotions').distinct('bannerCategory');
    console.log("Distinct bannerCategory in banner_promotions:", bannerCategories);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

checkDealsCategories();

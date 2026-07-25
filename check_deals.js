const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkDeals() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://atharvapugade:iJk4Hn5CjWn5m03T@cluster0.z2i2t.mongodb.net/GOLO?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    let dbName = 'test';
    if (uri.includes('GOLO')) {
       dbName = 'GOLO';
    }
    const db = client.db(dbName);
    
    // Check offers
    const offers = await db.collection('offers').find({}).limit(1).toArray();
    console.log("Offers sample:", offers);
    
    // Check banner_promotions
    const banners = await db.collection('banner_promotions').find({}).limit(1).toArray();
    console.log("Banners sample:", banners);
    
    // Check merchant_products
    const mproducts = await db.collection('merchant_products').find({}).limit(1).toArray();
    console.log("Merchant Products sample:", mproducts);
    
    // Check products
    const products = await db.collection('products').find({}).limit(1).toArray();
    console.log("Products sample:", products);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

checkDeals();

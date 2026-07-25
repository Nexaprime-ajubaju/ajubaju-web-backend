const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkCategories() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://atharvapugade:iJk4Hn5CjWn5m03T@cluster0.z2i2t.mongodb.net/GOLO?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    let dbName = 'test';
    if (uri.includes('GOLO')) {
       dbName = 'GOLO';
    }
    const db = client.db(dbName);
    const collection = db.collection('categories');

    const count = await collection.countDocuments();
    console.log(`Total categories: ${count}`);
    
    const docs = await collection.find({}).toArray();
    console.log(docs);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

checkCategories();

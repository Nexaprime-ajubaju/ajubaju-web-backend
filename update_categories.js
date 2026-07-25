const { MongoClient } = require('mongodb');
require('dotenv').config();

const chojaCategories = [
  "Education", "Vehicle", "Property", "Employment", "Mobiles", 
  "Electronics & Home Appliances", "Matrimonial", "Business", 
  "Astrology", "Health & Wellness", "Lost & Found", "Service", 
  "Personal", "Pets", "Public Notice", "Travel", "Furniture", 
  "Greetings & Tributes", "Other"
];

async function updateCategories() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://atharvapugade:iJk4Hn5CjWn5m03T@cluster0.z2i2t.mongodb.net/GOLO?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('test'); // Check if it's 'test' or 'GOLO' from env
    // We should parse the db name from MONGODB_URI
    let dbName = 'test';
    if (uri.includes('GOLO')) {
       dbName = 'GOLO';
    }
    
    // Update Choja categories
    const resultChoja = await client.db(dbName).collection('categories').updateMany(
      { name: { $in: chojaCategories } },
      { $set: { platform: 'choja' } }
    );
    console.log(`Updated ${resultChoja.modifiedCount} categories to choja.`);

    // Update GOLO categories (all others, or specific ones)
    const resultGolo = await client.db(dbName).collection('categories').updateMany(
      { name: { $nin: chojaCategories } },
      { $set: { platform: 'golo' } }
    );
    console.log(`Updated ${resultGolo.modifiedCount} categories to golo.`);

  } catch (error) {
    console.error("Error updating categories:", error);
  } finally {
    await client.close();
  }
}

updateCategories();

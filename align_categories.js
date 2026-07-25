const { MongoClient } = require('mongodb');
require('dotenv').config();

const goloCategories = [
  "Food & Restaurants", "Home Services", "Beauty & Wellness",
  "Healthcare & Medical", "Hotels & Accommodation", "Shopping & Retail",
  "Education & Training", "Real Estate", "Events & Entertainment",
  "Professional Services", "Automotive Services", "Home Improvement",
  "Fitness & Sports", "Daily Needs & Utilities", "Local Businesses & Vendors"
];

const chojaCategories = [
  "Education", "Vehicle", "Property", "Employment", "Mobiles", 
  "Electronics & Home Appliances", "Matrimonial", "Business", 
  "Astrology", "Health & Wellness", "Lost & Found", "Service", 
  "Personal", "Pets", "Public Notice", "Travel", "Furniture", 
  "Greetings & Tributes", "Other"
];

async function alignCategories() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://atharvapugade:iJk4Hn5CjWn5m03T@cluster0.z2i2t.mongodb.net/GOLO?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    
    // Parse DB name
    let dbName = 'test';
    if (uri.includes('GOLO')) {
       dbName = 'GOLO';
    }
    const db = client.db(dbName);
    const collection = db.collection('categories');

    // Remove all categories not in the two lists
    const allValidNames = [...goloCategories, ...chojaCategories];
    const deleteResult = await collection.deleteMany({ name: { $nin: allValidNames } });
    console.log(`Deleted ${deleteResult.deletedCount} old/extra categories.`);

    // Seed missing GOLO
    let addedGolo = 0;
    for (const name of goloCategories) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const result = await collection.updateOne(
        { name },
        { 
          $setOnInsert: { slug, parent: "None (Root Category)", status: "Active" },
          $set: { platform: "golo" }
        },
        { upsert: true }
      );
      if (result.upsertedId) addedGolo++;
    }

    // Seed missing Choja
    let addedChoja = 0;
    for (const name of chojaCategories) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const result = await collection.updateOne(
        { name },
        { 
          $setOnInsert: { slug, parent: "None (Root Category)", status: "Active" },
          $set: { platform: "choja" }
        },
        { upsert: true }
      );
      if (result.upsertedId) addedChoja++;
    }

    console.log(`Successfully aligned categories. Added ${addedGolo} Golo and ${addedChoja} Choja.`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

alignCategories();

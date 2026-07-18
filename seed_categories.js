require('dotenv').config();
const mongoose = require('mongoose');

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://golouser:golopassword@cluster0.p7102.mongodb.net/golo?retryWrites=true&w=majority&appName=Cluster0');
  
  const db = mongoose.connection.db;
  console.log('Connected.');

  const adsCollection = db.collection('ads');
  const categoriesCollection = db.collection('categories');

  const uniqueCategories = await adsCollection.distinct('category');
  console.log('Found unique categories in Ads:', uniqueCategories);

  const bulkOps = [];
  for (const catName of uniqueCategories) {
    if (!catName) continue;
    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    bulkOps.push({
      updateOne: {
        filter: { name: catName },
        update: { $set: { name: catName, slug, parent: '-', status: 'Active', createdAt: new Date(), updatedAt: new Date() } },
        upsert: true
      }
    });
  }

  if (bulkOps.length > 0) {
    console.log('Seeding categories...');
    await categoriesCollection.bulkWrite(bulkOps, { ordered: false }).catch(err => {
      console.log('Some documents had duplicates, ignoring...');
    });
    console.log('Seeding completed!');
  } else {
    console.log('No categories to seed.');
  }

  process.exit(0);
}

seed().catch(console.error);
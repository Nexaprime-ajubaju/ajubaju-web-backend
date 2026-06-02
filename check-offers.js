const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/golo';

async function checkOffers() {
  try {
    await mongoose.connect(mongoUri);

    const db = mongoose.connection.db;
    
    // Check all offers
    console.log('=== ALL OFFERS IN DATABASE ===\n');
    const allOffers = await db.collection('offers').find({}).toArray();
    console.log(`Total offers in DB: ${allOffers.length}\n`);

    const offersByCategory = {};
    allOffers.forEach(o => {
      const cat = o.category || 'NO_CATEGORY';
      if (!offersByCategory[cat]) offersByCategory[cat] = [];
      offersByCategory[cat].push(o);
    });

    console.log('Offers by category:');
    Object.entries(offersByCategory).forEach(([category, offers]) => {
      console.log(`\n${category}: ${offers.length} offers`);
      offers.forEach((o, i) => {
        console.log(`  ${i+1}. ${o.title} (${o.merchantName})`);
        console.log(`     Status: ${o.status}`);
      });
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkOffers();

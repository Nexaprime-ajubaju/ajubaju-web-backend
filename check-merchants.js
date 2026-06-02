const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/golo';

async function checkMerchants() {
  try {
    await mongoose.connect(mongoUri);

    const db = mongoose.connection.db;
    
    console.log('=== ALL MERCHANTS WITH CATEGORIES ===\n');
    const merchants = await db.collection('merchants').find({}).toArray();
    
    console.log(`Total merchants: ${merchants.length}\n`);
    
    merchants.forEach((m, i) => {
      console.log(`${i+1}. ${m.storeName}`);
      console.log(`   UserId: ${m.userId}`);
      console.log(`   Category: ${m.storeCategory}`);
      console.log(`   SubCategory: ${m.storeSubCategory}`);
      console.log('');
    });

    // Group by category
    console.log('\n=== MERCHANTS BY CATEGORY ===\n');
    const byCategory = {};
    merchants.forEach(m => {
      const cat = m.storeCategory || 'NO_CATEGORY';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(m);
    });

    Object.entries(byCategory).forEach(([cat, list]) => {
      console.log(`${cat}: ${list.length} merchants`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkMerchants();

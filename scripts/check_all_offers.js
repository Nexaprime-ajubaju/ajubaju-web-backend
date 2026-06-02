const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function checkAllOffers() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const now = new Date();

  console.log('=== ALL ACTIVE OFFERS (status + date valid) ===\n');
  
  const offers = await db.collection('offers').find({
    status: { $in: ['under_review', 'approved', 'active'] },
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ createdAt: -1 }).toArray();

  console.log(`Total valid offers: ${offers.length}\n`);
  
  offers.forEach((o, i) => {
    console.log(`${i+1}. ${o.title}`);
    console.log(`   _id: ${o._id}`);
    console.log(`   category: "${o.category}"`);
    console.log(`   businessCategory: "${o.businessCategory || 'NOT SET'}"`);
    console.log(`   businessSubCategory: "${o.businessSubCategory || 'NOT SET'}"`);
    console.log(`   merchantId: ${o.merchantId}`);
    console.log(`   status: ${o.status}`);
    console.log(`   imageUrl: ${o.imageUrl ? 'SET' : 'MISSING'}`);
    console.log('');
  });

  // Check merchants
  const merchantIds = [...new Set(offers.map(o => String(o.merchantId)))];
  const merchants = await db.collection('merchants').find({
    userId: { $in: merchantIds }
  }).toArray();
  
  console.log(`\n=== MERCHANTS for these offers (${merchants.length}) ===\n`);
  merchants.forEach(m => {
    console.log(`Merchant: ${m.storeName}`);
    console.log(`  userId: ${m.userId}`);
    console.log(`  storeCategory: "${m.storeCategory}"`);
    console.log(`  storeSubCategory: "${m.storeSubCategory}"`);
    console.log(`  status: ${m.status}`);
    console.log('');
  });

  await mongoose.disconnect();
}

checkAllOffers().catch(err => {
  console.error(err);
  process.exit(1);
});

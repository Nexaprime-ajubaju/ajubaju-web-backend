const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  console.log('=== MERCHANTS (active) ===');
  const merchants = await db.collection('merchants').find({ status: 'active' })
    .project({ storeName: 1, storeCategory: 1, storeSubCategory: 1, status: 1 })
    .toArray();

  merchants.forEach(m => {
    console.log(`${m.storeName} | category: "${m.storeCategory}" | sub: "${m.storeSubCategory}"`);
  });

  console.log(`\nTotal active merchants: ${merchants.length}`);

  console.log('\n=== OFFERS (status in [under_review, approved, active]) ===');
  const now = new Date();
  const offers = await db.collection('offers').find({
    status: { $in: ['under_review', 'approved', 'active'] },
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ createdAt: -1 }).limit(20).toArray();

  offers.forEach((o, i) => {
    console.log(`${i+1}. ${o.title || 'No title'}`);
    console.log(`   category: "${o.category}"`);
    console.log(`   merchantId: ${o.merchantId} | status: ${o.status}`);
    console.log(`   imageUrl: ${o.imageUrl ? 'SET' : 'MISSING'}`);
  });

  console.log(`\nTotal valid offers: ${offers.length}`);

  const activeWithImage = offers.filter(o => o.status === 'active' && o.imageUrl).length;
  console.log(`Active offers with image: ${activeWithImage} / ${offers.filter(o => o.status === 'active').length}`);

  await mongoose.disconnect();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function checkUnderReviewOffers() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  const now = new Date();
  console.log('Current UTC date:', now.toISOString().split('T')[0]);

  const offers = await db.collection('offers').find({
    status: { $in: ['under_review', 'approved', 'active'] }
  }).toArray();

  console.log(`\nTotal offers with relevant status: ${offers.length}`);

  const statusStats = {};
  offers.forEach(o => {
    statusStats[o.status] = (statusStats[o.status] || 0) + 1;
  });
  console.log('Status breakdown:', statusStats);

  // Check date validity
  const withValidDates = offers.filter(o => {
    const start = new Date(o.startDate);
    const end = new Date(o.endDate);
    return start <= now && end >= now;
  });
  console.log(`Offers with valid date range (start <= now <= end): ${withValidDates.length}`);

  // Show under_review offers dates
  console.log('\n--- Under Review Offers ---');
  offers.filter(o => o.status === 'under_review').forEach((o, i) => {
    console.log(`${i+1}. ${o.title}`);
    console.log(`   startDate: ${o.startDate} | endDate: ${o.endDate}`);
    console.log(`   category: "${o.category}" | merchantId: ${o.merchantId}`);
    const start = new Date(o.startDate);
    const end = new Date(o.endDate);
    console.log(`   Valid now? start<=now: ${start <= now}, end>=now: ${end >= now} → ${start <= now && end >= now ? 'VALID' : 'INVALID'}`);
  });

  await mongoose.disconnect();
}

checkUnderReviewOffers().catch(err => {
  console.error(err);
  process.exit(1);
});

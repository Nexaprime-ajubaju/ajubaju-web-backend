const mongoose = require('mongoose');

(async () => {
  await mongoose.connect('mongodb://localhost:27017/golo');
  const db = mongoose.connection;
  
  const banners = await db.collection('bannerpromotions').find({}).toArray();
  console.log(`Total banners: ${banners.length}`);
  
  const byLocation = {};
  banners.forEach(b => {
    const loc = b.targetCity || 'unknown';
    if (!byLocation[loc]) byLocation[loc] = [];
    byLocation[loc].push({ title: b.bannerTitle, status: b.status, merchantId: b.merchantId, requestId: b.requestId });
  });
  
  for (const [loc, list] of Object.entries(byLocation)) {
    console.log(`\nLocation [${loc}]: ${list.length} banners`);
    list.forEach((b, i) => {
      console.log(`  ${i+1}. ${b.title} (${b.status}) - Merch: ${b.merchantId} - Req: ${b.requestId}`);
    });
  }
  
  console.log('\n--- Banners Queue ---');
  const queues = await db.collection('bannerqueues').find({}).toArray();
  for (const q of queues) {
    console.log(`City: ${q.city}`);
    console.log(`  District Queue:`, q.districtQueue);
    console.log(`  City Queue:`, q.cityQueue);
    console.log(`  Town Queue:`, q.townQueue);
  }
  
  await mongoose.disconnect();
})();

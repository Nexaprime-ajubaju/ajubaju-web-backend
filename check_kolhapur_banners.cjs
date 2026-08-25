const mongoose = require('mongoose');
require('dotenv').config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection('bannerpromotions');
  const banners = await col.find({
    status: 'active',
    isHomepageVisible: true,
    promotionType: 'banner',
    targetCities: { $regex: /kolhapur/i }
  }).project({ requestId: 1, merchantName: 1, bannerTitle: 1, targetCities: 1, coverageType: 1 }).toArray();
  console.log('Active merchant banners targeting Kolhapur:', banners.length);
  banners.forEach((b, i) => {
    console.log((i+1) + '. [' + (b.coverageType || 'N/A') + '] ' + b.merchantName + ' - ' + (b.bannerTitle || 'No title') + ' | targets: ' + (b.targetCities||[]).join(', '));
  });
  await mongoose.disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });

const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb://localhost:27017/golo_db');
  const db = mongoose.connection.db;
  const attempts = await db.collection('merchantmoderationattempts').find().sort({ createdAt: -1 }).limit(10).toArray();
  console.log('Attempts:', attempts);
  const offers = await db.collection('offerpromotions').find({ 'security.failedImageModerations': { $gt: 0 } }).toArray();
  console.log('Offers with failures:', offers.map(o => ({ _id: o._id, security: o.security })));
  process.exit(0);
}
run();

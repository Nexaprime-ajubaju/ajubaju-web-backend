const mongoose = require('mongoose');
require('dotenv').config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  await db.collection('merchants').updateOne(
    { userId: '69e8a82865a19fe7680b9fef' },
    { $set: { 'security.contentUploadRestrictionUntil': null, 'security.restrictionCount30Days': 0 } }
  );
  console.log('Restriction lifted for testing user.');
  process.exit(0);
}
run();

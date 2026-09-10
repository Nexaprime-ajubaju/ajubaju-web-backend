const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // List ALL merchants
  const merchants = await db.collection('users').find({ accountType: 'merchant' }).toArray();
  console.log('All merchants:', JSON.stringify(merchants.map(u => ({
    id: u._id,
    name: u.name,
    email: u.email,
    referralCode: u.referralCode,
    referredBy: u.referredBy,
    createdAt: u.createdAt
  })), null, 2));

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });

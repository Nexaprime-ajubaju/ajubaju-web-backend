const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('\n=== ALL REFERRAL RECORDS ===');
  const referrals = await db.collection('referrals').find({}).toArray();
  console.log(JSON.stringify(referrals, null, 2));

  console.log('\n=== ALL MERCHANTS WITH referredBy SET ===');
  const referred = await db.collection('users').find({ referredBy: { $exists: true, $ne: null }, accountType: 'merchant' }).toArray();
  console.log(JSON.stringify(referred.map(u => ({
    id: u._id,
    name: u.name,
    email: u.email,
    referredBy: u.referredBy,
    createdAt: u.createdAt
  })), null, 2));

  console.log('\n=== MOST RECENT MERCHANT (last 3) ===');
  const recent = await db.collection('users').find({ accountType: 'merchant' }).sort({ createdAt: -1 }).limit(3).toArray();
  console.log(JSON.stringify(recent.map(u => ({
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

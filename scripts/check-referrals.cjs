const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Find ALL users with referredBy set
  const referred = await db.collection('users').find({ referredBy: { $exists: true, $ne: null } }).toArray();
  console.log('Users with referredBy:', JSON.stringify(referred.map(u => ({
    id: u._id,
    name: u.name,
    referredBy: u.referredBy,
    accountType: u.accountType
  })), null, 2));

  // Check referrals collection
  const referrals = await db.collection('referrals').find({}).toArray();
  console.log('Total referral records:', referrals.length);

  // Backfill: create pending referral for any referred user who doesn't have one
  for (const user of referred) {
    const existing = await db.collection('referrals').findOne({ referredUserId: user._id });
    if (!existing) {
      console.log(`Creating missing referral for user: ${user.name} (${user._id}), referredBy: ${user.referredBy}`);
      await db.collection('referrals').insertOne({
        referrerId: user.referredBy,
        referredUserId: user._id,
        status: 'PENDING',
        rewardType: 'SUBSCRIPTION_EXTENSION',
        rewardDays: 15,
        createdAt: user.createdAt || new Date(),
        updatedAt: new Date(),
      });
      console.log('Created!');
    } else {
      console.log(`Referral already exists for ${user.name}`);
    }
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });

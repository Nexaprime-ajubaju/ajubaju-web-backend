const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Referrer: Atharv Apugade (ridematebussiness@gmail.com) - ATHA6650
  const referrer = await db.collection('users').findOne({ referralCode: 'ATHA6650' });
  if (!referrer) { console.log('Referrer not found!'); process.exit(1); }
  console.log('Referrer:', referrer.name, referrer._id.toString());

  // Referred: Refer acc 2 (atharvapugade4@gmail.com) - registered today via referral
  const referred = await db.collection('users').findOne({ email: 'atharvapugade4@gmail.com' });
  if (!referred) { console.log('Referred user not found!'); process.exit(1); }
  console.log('Referred:', referred.name, referred._id.toString());

  // Set referredBy on referred user
  await db.collection('users').updateOne(
    { _id: referred._id },
    { $set: { referredBy: referrer._id } }
  );
  console.log('Set referredBy on referred user ✓');

  // Create referral record if not already present
  const existing = await db.collection('referrals').findOne({ referredUserId: referred._id });
  if (existing) {
    console.log('Referral record already exists:', existing.status);
  } else {
    await db.collection('referrals').insertOne({
      referrerId: referrer._id,
      referredUserId: referred._id,
      status: 'PENDING',
      rewardType: 'SUBSCRIPTION_EXTENSION',
      rewardDays: 15,
      createdAt: referred.createdAt || new Date(),
      updatedAt: new Date(),
    });
    console.log('Created referral record ✓');
  }

  // Final state
  const allReferrals = await db.collection('referrals').find({}).toArray();
  console.log('\nAll referrals now:', JSON.stringify(allReferrals.map(r => ({
    id: r._id,
    status: r.status,
    createdAt: r.createdAt
  })), null, 2));

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });

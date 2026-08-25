
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const vouchers = await db.collection('vouchers').find({ status: 'redeemed' }).toArray();
  for (const v of vouchers) {
    let points = 0;
    
    // Convert string to ObjectId if necessary
    let oid = v.offerId;
    if (typeof v.offerId === 'string') {
        oid = new mongoose.Types.ObjectId(v.offerId);
    }
    
    const offer = await db.collection('offers').findOne({ _id: oid });
    if (offer && offer.loyaltyRewardEnabled && offer.loyaltyPointsPerPurchase) {
      points = Number(offer.loyaltyPointsPerPurchase) || 0;
    } else {
      const banner = await db.collection('banners').findOne({ _id: oid });
      if (banner && banner.loyaltyRewardEnabled && banner.loyaltyStarsPerPurchase && banner.loyaltyScorePerStar) {
        points = Number(banner.loyaltyStarsPerPurchase) * Number(banner.loyaltyScorePerStar) || 0;
      }
    }
    await db.collection('vouchers').updateOne({ _id: v._id }, { $set: { loyaltyPointsEarned: points } });
    if (points > 0) {
      console.log('Updated voucher', v._id, 'with points:', points);
    }
  }
  console.log('Backfill complete!');
  process.exit(0);
}

run().catch(console.error);


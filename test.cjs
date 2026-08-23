const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/golo').then(async () => {
  const db = mongoose.connection;
  const merchant = await db.collection('merchants').findOne({ storeName: /atharv/i });
  console.log('Merchant userId:', merchant?.userId, ' _id:', merchant?._id);
  const offers = await db.collection('offers').find({}).toArray();
  if (offers.length > 0) {
     console.log('First offer merchantId:', offers[0].merchantId);
  }
  const matchingOffers = await db.collection('offers').find({ merchantId: merchant?.userId }).toArray();
  console.log('Matching offers count (userId):', matchingOffers.length);
  const matchingOffers2 = await db.collection('offers').find({ merchantId: merchant?._id?.toString() }).toArray();
  console.log('Matching offers count (_id):', matchingOffers2.length);
  
  process.exit(0);
});

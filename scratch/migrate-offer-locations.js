require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const offersCollection = mongoose.connection.collection('offers');
  const merchantsCollection = mongoose.connection.collection('merchants');

  const offers = await offersCollection.find({ location: { $exists: false } }).toArray();
  console.log(`Found ${offers.length} offers to migrate`);

  let count = 0;
  for (const offer of offers) {
    const merchant = await merchantsCollection.findOne({ userId: offer.merchantId });
    let lng = 0;
    let lat = 0;

    if (merchant) {
      if (merchant.storeLocationLongitude != null && !Number.isNaN(Number(merchant.storeLocationLongitude))) {
        lng = Number(merchant.storeLocationLongitude);
      }
      if (merchant.storeLocationLatitude != null && !Number.isNaN(Number(merchant.storeLocationLatitude))) {
        lat = Number(merchant.storeLocationLatitude);
      }
    }

    await offersCollection.updateOne(
      { _id: offer._id },
      {
        $set: {
          location: {
            type: 'Point',
            coordinates: [lng, lat],
          }
        }
      }
    );
    count++;
  }

  console.log(`Successfully migrated ${count} offers`);
  await mongoose.disconnect();
}

migrate().catch(console.error);

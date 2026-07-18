const mongoose = require('mongoose');
const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function test() {
  await mongoose.connect(uri);
  const db = mongoose.connection.useDb('test');
  
  const offers = await db.collection('offers').find({}).sort({createdAt: -1}).limit(2).toArray();
  const merchantIds = offers.map(o => o.merchantId);
  const merchants = await db.collection('merchants').find({userId: {$in: merchantIds}}).toArray();
  
  console.log('Merchant locations:');
  merchants.forEach(m => {
    console.log(m.userId, m.storeLocation, m.storeLocationLatitude, m.storeLocationLongitude);
  });
  process.exit(0);
}
test();

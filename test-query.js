const mongoose = require('mongoose');

async function test() {
  console.log('Connecting...');
  await mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0');
  console.log('Connected.');
  
  const Offer = mongoose.model('Offer', new mongoose.Schema({ status: String }, { strict: false }), 'offers');
  
  console.log('Querying offers WITH NO FIELDS...');
  const start = Date.now();
  const offers = await Offer.find({ status: { $in: ['under_review', 'approved', 'active'] } }).select('_id status').limit(300).lean().exec();
  console.log(`Found ${offers.length} offers in ${Date.now() - start}ms`);

  const Merchant = mongoose.model('Merchant', new mongoose.Schema({ userId: String }, { strict: false }), 'merchants');
  const merchantIds = Array.from(new Set(offers.map(o => String(o.merchantId))));
  
  console.log('Querying merchants WITH NO FIELDS for IDs:', merchantIds.length);
  const start2 = Date.now();
  const merchants = await Merchant.find({ userId: { $in: merchantIds } }).select('_id userId').lean().exec();
  console.log(`Found ${merchants.length} merchants in ${Date.now() - start2}ms`);
  
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

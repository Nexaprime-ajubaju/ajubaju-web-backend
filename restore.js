const mongoose = require('mongoose');
mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0').then(async () => {
  const db = mongoose.connection.db;
  const now = new Date();
  now.setDate(now.getDate() + 30); // 30 days in future
  await db.collection('banner_promotions').updateMany({ targetCities: /kolhapur/i }, { $set: { status: 'active', isHomepageVisible: true, endDate: now } });
  console.log('Restored all Kolhapur banners to active');
  process.exit(0);
}).catch(console.error);

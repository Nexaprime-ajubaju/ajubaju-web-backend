const mongoose = require('mongoose');
mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0').then(async () => {
  const db = mongoose.connection.db;
  const banners = await db.collection('banner_promotions').find({ targetCities: /kolhapur/i, status: 'active' }).toArray();
  console.log('Active Kolhapur Banners:', banners.length);
  banners.forEach(b => console.log(b.requestId));
  
  const allBanners = await db.collection('banner_promotions').find({ status: 'active' }).toArray();
  console.log('Total Active Banners:', allBanners.length);
  process.exit(0);
}).catch(console.error);

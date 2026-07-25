const mongoose = require('mongoose');
mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0')
.then(async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('categories');
  
  await collection.updateMany(
    { name: { $in: ['Automotive Services', 'Local Businesses & Vendors', 'Healthcare & Medical', 'Professional Services', 'Health & Wellness', 'Employment'] } },
    { $set: { platform: 'choja' } }
  );
  
  await collection.updateMany(
    { platform: { $exists: false } },
    { $set: { platform: 'golo' } }
  );
  
  console.log('Update complete');
  process.exit();
});

const mongoose = require('mongoose');

async function deletePlaceholders() {
  const uri = process.env.MONGODB_URI || "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  
  const db = mongoose.connection.db;
  console.log("Connected.");
  
  console.log(`Approving all offers...`);
  const offersResult = await db.collection('offers').updateMany({ status: 'under_review' }, { $set: { status: 'active' } });
  console.log(`Approved ${offersResult.modifiedCount} entries in 'offers'.`);
  
  await mongoose.disconnect();
  console.log("Done.");
}

deletePlaceholders().catch(console.error);

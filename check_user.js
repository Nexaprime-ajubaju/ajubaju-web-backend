const mongoose = require('mongoose');

async function test() {
  const uri = process.env.MONGODB_URI || "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  
  const db = mongoose.connection.db;
  console.log("Connected.");
  
  const userId = "6a49feb81808e29aad97ada4";
  console.log("Checking user collection for ID:", userId);
  
  const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) });
  if (!user) {
    console.log("User not found!");
  } else {
    console.log("User found:", user);
  }
  
  await mongoose.disconnect();
}

test().catch(console.error);

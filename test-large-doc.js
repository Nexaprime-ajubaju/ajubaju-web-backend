const { MongoClient } = require('mongodb');

const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('test');
    
    // fetch the largest document we saw: 6a5094421c29664c2a4d8490
    const cursor = db.collection('banner_promotions').find({});
    
    while (await cursor.hasNext()) {
       const doc = await cursor.next();
       const size = Buffer.byteLength(JSON.stringify(doc));
       if (size > 1000000) { // greater than 1MB
          console.log(`Analyzing document ${doc._id}`);
          for (const key of Object.keys(doc)) {
            const valSize = Buffer.byteLength(JSON.stringify(doc[key] || ''));
            if (valSize > 50000) {
              console.log(` - Field '${key}' is MASSIVE: ${(valSize / 1024).toFixed(2)} KB`);
              // Print the first 100 characters to see what it is
              const valStr = JSON.stringify(doc[key]);
              console.log(`   Starts with: ${valStr.substring(0, 100)}...`);
            }
          }
          break; // just check one
       }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
run();

const { MongoClient } = require('mongodb');
const fs = require('fs');

const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('test');
    
    console.log('Calculating sizes...');
    const cursor = db.collection('banner_promotions').find({});
    
    let i = 0;
    while (await cursor.hasNext()) {
       const doc = await cursor.next();
       const size = Buffer.byteLength(JSON.stringify(doc));
       if (size > 100000) { // greater than 100kb
          console.log(`Document ${doc._id} is MASSIVE: ${(size / 1024 / 1024).toFixed(2)} MB`);
       }
       i++;
    }
    console.log('Done scanning', i, 'docs');
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
run();

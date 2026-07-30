const { MongoClient } = require('mongodb');

const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('test');
    
    console.log('Fetching only _ids...');
    const start = Date.now();
    const docs = await db.collection('banner_promotions').find({}, { projection: { _id: 1, status: 1 } }).toArray();
    console.log('Fetched', docs.length, 'docs in', Date.now() - start, 'ms');
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
run();

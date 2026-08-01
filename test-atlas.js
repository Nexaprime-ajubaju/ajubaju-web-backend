const { MongoClient } = require('mongodb');

const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function run() {
  console.log('Connecting to Atlas...');
  const start = Date.now();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log('Connected in', Date.now() - start, 'ms');
    
    const db = client.db('test'); // Replace with correct DB if needed, Mongoose uses default from URI
    
    const queryStart = Date.now();
    const count = await db.collection('banner_promotions').countDocuments();
    console.log('Count:', count, 'in', Date.now() - queryStart, 'ms');
    
    const findStart = Date.now();
    const docs = await db.collection('banner_promotions').find({ status: { $in: ['approved', 'active'] } }).toArray();
    console.log('Found:', docs.length, 'in', Date.now() - findStart, 'ms');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}
run();

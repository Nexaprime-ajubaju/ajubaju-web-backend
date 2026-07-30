const mongoose = require('mongoose');

const REMOTE_URI =
  process.env.REMOTE_MONGODB_URI ||
  'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

const LOCAL_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://localhost:27017/golo';

async function cloneAtlasToLocal() {
  console.log('🚀 Cloning MongoDB Atlas -> Local MongoDB (mongodb://localhost:27017/golo)...');

  const remoteConn = await mongoose.createConnection(REMOTE_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  }).asPromise();
  
  const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();

  const remoteDb = remoteConn.db;
  const localDb = localConn.db;

  const collections = await remoteDb.collections();
  console.log(`Total collections found: ${collections.length}\n`);

  let totalDocs = 0;
  let count = 0;

  for (const remoteCol of collections) {
    count++;
    const colName = remoteCol.collectionName;
    if (colName.startsWith('system.')) continue;

    const localCol = localDb.collection(colName);
    try {
      await localCol.drop();
    } catch (e) {}

    const docs = await remoteCol.find({}).toArray();
    if (docs.length > 0) {
      await localCol.insertMany(docs);
      totalDocs += docs.length;
    }
    console.log(`[${count}/${collections.length}] ✓ ${colName}: ${docs.length} docs`);
  }

  console.log('\n----------------------------------------------------');
  console.log(`🎉 SUCCESS: Cloned ${count} collections (${totalDocs} docs) to local MongoDB!`);
  console.log('----------------------------------------------------');

  await remoteConn.close();
  await localConn.close();
  process.exit(0);
}

cloneAtlasToLocal().catch((err) => {
  console.error('❌ Cloning failed:', err);
  process.exit(1);
});

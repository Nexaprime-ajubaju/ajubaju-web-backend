const mongoose = require('mongoose');

const REMOTE_URI = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';
const LOCAL_URI = 'mongodb://localhost:27017/golo';

async function main() {
  console.log('Fetching collection names from Atlas...');
  const remoteConn = await mongoose.createConnection(REMOTE_URI).asPromise();
  const collections = await remoteConn.db.collections();
  const colNames = collections.map(c => c.collectionName).filter(n => !n.startsWith('system.'));
  await remoteConn.close();

  console.log(`Found ${colNames.length} collections. Copying documents...`);

  const remote = await mongoose.createConnection(REMOTE_URI).asPromise();
  const local = await mongoose.createConnection(LOCAL_URI).asPromise();

  let totalDocs = 0;
  for (let i = 0; i < colNames.length; i++) {
    const colName = colNames[i];
    try {
      const docs = await remote.db.collection(colName).find({}).toArray();
      await local.db.collection(colName).deleteMany({});
      if (docs.length > 0) {
        await local.db.collection(colName).insertMany(docs);
      }
      totalDocs += docs.length;
      console.log(`[${i + 1}/${colNames.length}] ${colName}: ${docs.length} docs copied`);
    } catch (err) {
      console.error(`Error copying ${colName}:`, err.message);
    }
  }

  // Activate all approved banners locally for immediate viewing
  await local.db.collection('banner_promotions').updateMany(
    { status: { $in: ['approved', 'active'] } },
    {
      $set: {
        status: 'active',
        isHomepageVisible: true,
        paymentStatus: 'paid',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31')
      }
    }
  );
  await local.db.collection('banner_city_queues').deleteMany({});

  console.log(`\n✅ ALL DONE! Cloned ${colNames.length} collections (${totalDocs} documents) into local MongoDB mongodb://localhost:27017/golo`);

  await remote.close();
  await local.close();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

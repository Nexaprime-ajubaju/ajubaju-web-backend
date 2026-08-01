const mongoose = require('mongoose');
const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function main() {
  await mongoose.connect(uri);
  const result = await mongoose.connection.db.collection('banner_promotions').updateMany(
    { status: 'approved' },
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
  console.log('Successfully activated approved banners:', result.modifiedCount);

  // Clear city queues so queue builder rebuilds with all active banners
  await mongoose.connection.db.collection('banner_city_queues').deleteMany({});
  console.log('Cleared old city queues to trigger fresh queue build');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

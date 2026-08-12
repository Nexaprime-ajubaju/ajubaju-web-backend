const mongoose = require('mongoose');
const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';
mongoose.connect(uri).then(async () => {
  const mId = new mongoose.Types.ObjectId('6a5893996808d3fc39f5d849');
  
  const now = new Date();
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    keys.push(d.toISOString().slice(0, 10));
  }
  const start = new Date(keys[0]);
  
  const rows = await mongoose.connection.collection('orders').aggregate([
    { $match: { merchantId: mId, completedAt: { $gte: start }, status: 'completed' } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$completedAt' },
        },
        count: { $sum: 1 },
      },
    },
  ]).toArray();
  
  console.log('Rows:', JSON.stringify(rows, null, 2));
  process.exit(0);
});

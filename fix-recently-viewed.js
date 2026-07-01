const { MongoClient } = require('mongodb');
require('dotenv').config();
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const user = await db.collection('users').findOne({ email: 'testuser@example.com' });
  const ads = await db.collection('ads').find({ status: 'active' }).limit(5).toArray();
  await db.collection('ads').updateMany(
    { _id: { $in: ads.map(a => a._id) } },
    { $push: { viewHistory: String(user._id) } }
  );
  console.log('Updated viewHistory');
  await client.close();
}
run();

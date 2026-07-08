const { MongoClient } = require('mongodb');
const uri = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';
(async () => {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const dbNames = ['golo', 'GOLO', 'golo_backend', 'nexa_db'];
  for (const dbName of dbNames) {
    try {
      const db = client.db(dbName);
      const user = await db.collection('users').findOne({ email: 'atharv@golo.com' });
      console.log('DB:', dbName, '=>', user ? {
        _id: user._id,
        email: user.email,
        accountType: user.accountType,
        role: user.role,
        isBanned: user.isBanned,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
      } : null);
    } catch (err) {
      console.error('DB error', dbName, err.message);
    }
  }
  await client.close();
})().catch(err => { console.error(err); process.exit(1); });

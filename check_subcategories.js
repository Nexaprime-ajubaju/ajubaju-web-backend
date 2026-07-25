const mongoose = require('mongoose');

mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0')
.then(async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('categories');
  const cats = await collection.find({ parent: { $ne: '-' } }).toArray();
  const subCats = cats.filter(c => c.parent !== 'None (Root Category)');
  
  if (subCats.length > 0) {
    console.log(JSON.stringify(subCats.map(c => ({ name: c.name, parent: c.parent, platform: c.platform })), null, 2));
  } else {
    console.log('No subcategories found');
  }
  process.exit();
});

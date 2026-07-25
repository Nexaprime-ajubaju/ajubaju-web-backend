const mongoose = require('mongoose');

mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0')
.then(async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('categories');
  const cats = await collection.find({}).toArray();
  
  for (const cat of cats) {
    if (cat.parent && cat.parent !== 'None (Root Category)' && cat.parent !== '-') {
      // Find parent category
      const parentCat = cats.find(c => c.name === cat.parent);
      if (parentCat) {
        // Sync platform
        await collection.updateOne(
          { _id: cat._id },
          { $set: { platform: parentCat.platform } }
        );
        console.log(`Updated subcategory ${cat.name} to match parent ${parentCat.name} platform (${parentCat.platform})`);
      }
    }
  }

  // Also fix Transport specifically if its parent is missing or wrong
  const transport = cats.find(c => c.name === 'Transport');
  if (transport) {
    await collection.updateOne(
      { _id: transport._id },
      { $set: { platform: 'choja' } }
    );
    console.log('Fixed Transport to choja');
  }

  process.exit();
});

const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0');
  
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);

  // Set all 'under_review' offers to 'active' and extend their end date to the future so they show up
  const result = await mongoose.connection.collection('offers').updateMany(
    { },
    { 
      $set: { 
        status: 'active',
        isActive: true,
        endDate: futureDate
      } 
    }
  );
  
  console.log(`Updated ${result.modifiedCount} offers to be active and unexpired.`);
  process.exit(0);
}

fix();

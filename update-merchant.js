const mongoose = require('mongoose');

const uri = "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";

async function updateMerchant() {
  await mongoose.connect(uri);
  console.log("Connected to DB");

  const merchantDb = mongoose.connection.useDb('test'); // default DB name is usually test
  const MerchantModel = merchantDb.collection('merchants');

  const result = await MerchantModel.updateOne(
    { storeEmail: 'ridematebussiness@gmail.com' },
    {
      $set: {
        businessType: 'Partnership',
        yearsInBusiness: 5,
        businessDescription: 'We build high-quality residential properties.',
        storeLocation: 'Pune, Maharashtra',
        storeLocationLatitude: 18.5204,
        storeLocationLongitude: 73.8567,
        storeSubCategory: 'Construction',
        documents: {
          aadhaarUrl: 'https://via.placeholder.com/400x300.png?text=Aadhaar+Card',
          panUrl: 'https://via.placeholder.com/400x300.png?text=PAN+Card',
          businessLicense: 'https://via.placeholder.com/400x300.png?text=Business+License'
        },
        profilePhoto: 'https://via.placeholder.com/150.png?text=Profile',
        shopPhoto: 'https://via.placeholder.com/300x200.png?text=Shop'
      }
    }
  );

  console.log("Matched:", result.matchedCount);
  console.log("Modified:", result.modifiedCount);
  
  await mongoose.disconnect();
}

updateMerchant().catch(console.error);

const mongoose = require('mongoose');

const uri = "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";

async function testUser() {
  await mongoose.connect(uri);
  const db = mongoose.connection.useDb('test');
  const UserModel = db.collection('users');
  const MerchantModel = db.collection('merchants');

  const idToFind = '6a58a3422ba4bc28ea6e8d88'; // This is from the console output the user sent
  console.log("Looking for ID:", idToFind);

  let user = null;
  try {
    user = await UserModel.findOne({ _id: new mongoose.Types.ObjectId(idToFind) });
    console.log("User by ObjectId:", user ? "Found" : "Not Found");
  } catch (e) {
    console.log("Invalid ObjectId format:", e.message);
  }
  
  if (!user) {
    user = await UserModel.findOne({ _id: idToFind });
    console.log("User by String:", user ? "Found" : "Not Found");
  }

  const merchant = await MerchantModel.findOne({ userId: idToFind });
  console.log("Merchant by String:", merchant ? "Found" : "Not Found");

  await mongoose.disconnect();
}

testUser().catch(console.error);

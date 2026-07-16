const mongoose = require('mongoose');
const uri = "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";

async function verify() {
  await mongoose.connect(uri);
  const db = mongoose.connection.useDb('test');
  const UserModel = db.collection('users');
  const MerchantModel = db.collection('merchants');

  const merchant = await MerchantModel.findOne({ storeEmail: 'ridematebussiness@gmail.com' });
  console.log("Merchant:", merchant);

  if (merchant) {
    const user = await UserModel.findOne({ _id: new mongoose.Types.ObjectId(merchant.userId) });
    console.log("Associated User:", user ? user._id : "NOT FOUND!");
  }

  await mongoose.disconnect();
}

verify().catch(console.error);

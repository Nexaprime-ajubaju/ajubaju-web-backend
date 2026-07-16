const mongoose = require('mongoose');
const uri = "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";

async function testUndefined() {
  await mongoose.connect(uri);
  const db = mongoose.connection.useDb('test');
  const UserModel = db.collection('users');

  try {
    const user = await UserModel.findOne({ _id: new mongoose.Types.ObjectId("undefined") });
    console.log("ObjectId('undefined') found:", user);
  } catch (e) {
    console.log("Error for ObjectId('undefined'):", e.message);
  }

  try {
    const user = await UserModel.findOne({ _id: "undefined" });
    console.log("String 'undefined' found:", user);
  } catch (e) {
    console.log("Error for String 'undefined':", e.message);
  }

  await mongoose.disconnect();
}
testUndefined().catch(console.error);

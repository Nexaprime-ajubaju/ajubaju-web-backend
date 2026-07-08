const mongoose = require("mongoose");
const uri = "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";
mongoose.connect(uri).then(async () => {
    const db = mongoose.connection.db;
    await db.collection("offers").updateOne({}, { $push: { viewHistory: "6a4de6e10b1a7464be21a722" } });
    console.log("Injected view");
    process.exit(0);
});

const mongoose = require('mongoose');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    const all = await db.collection('banner_promotions').find({}).toArray();
    fs.writeFileSync('banners.json', JSON.stringify(all, null, 2));
    console.log('Downloaded', all.length, 'banners');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    
    const db = mongoose.connection.db;
    const banners = await db.collection('banner_promotions').find({}).limit(5).toArray();
    console.log('Banners sample:', JSON.stringify(banners, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    
    console.log('Running native query...');
    const allCandidates = await db.collection('banner_promotions').find({
      status: { $in: ['approved', 'active'] }
    }).toArray();
    
    console.log('Query finished. Found:', allCandidates.length);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

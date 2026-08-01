const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    
    await db.collection('banner_city_queues').deleteMany({});
    console.log('Deleted queues');
    
    // Now call the endpoint!
    const res = await fetch('http://localhost:3005/banners/promotions/active?limit=10', {
      headers: {
        'Accept': 'application/json'
      }
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
    
    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
}
run();

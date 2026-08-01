const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/golo');
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    // Check states
    const states = await db.collection('banner_scheduler_states').find({}).toArray();
    console.log('States:', JSON.stringify(states, null, 2));
    
    // Check queues
    const queues = await db.collection('banner_queues').find({}).toArray();
    console.log('Queues:', JSON.stringify(queues, null, 2));
    
    // Check banners
    const banners = await db.collection('banner_promotions').find({}).toArray();
    console.log('Banners:', banners.length);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();

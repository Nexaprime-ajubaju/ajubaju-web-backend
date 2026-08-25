const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/golo_db');
  const db = mongoose.connection.db;
  
  const notifications = await db.collection('notifications').find({ type: 'new_message' }).sort({ createdAt: -1 }).limit(5).toArray();
  
  console.log('Recent chat notifications:', notifications);
  
  mongoose.disconnect();
}

test().catch(console.error);

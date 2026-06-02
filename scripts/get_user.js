// Simple script to get user credentials
const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function getUserInfo() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  
  const user = await db.collection('users').findOne({
    preferredCategories: { $exists: true, $ne: [] }
  });
  
  console.log(JSON.stringify({
    userId: user._id.toString(),
    email: user.email,
    preferredCategories: user.preferredCategories
  }, null, 2));
  
  await mongoose.disconnect();
}

getUserInfo().catch(console.error);

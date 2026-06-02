const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function diagnose() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  // Find users with preferredCategories
  const users = await db.collection('users').find({
    preferredCategories: { $exists: true, $ne: [] }
  }).limit(3).toArray();

  console.log(`Found ${users.length} users with preferences\n`);

  for (const user of users) {
    console.log(`User: ${user.email}`);
    console.log(`Preferred Categories: ${JSON.stringify(user.preferredCategories)}`);
    console.log(`_id: ${user._id}`);
    
    // Check if there's a valid JWT token we could use (skip - tokens are hashed)
    // Just show that the user exists with prefs
    console.log('');
  }

  // Also check users WITHOUT preferences
  const noPrefs = await db.collection('users').find({
    $or: [{ preferredCategories: { $exists: false } }, { preferredCategories: { $size: 0 } }]
  }).limit(2).toArray();
  
  console.log(`\nUsers with NO preferences: ${noPrefs.length}`);
  noPrefs.forEach(u => console.log(` - ${u.email}`));

  await mongoose.disconnect();
}

diagnose().catch(err => {
  console.error(err);
  process.exit(1);
});

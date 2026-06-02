const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function investigate() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // 1. Find users with preferredCategories
    const usersWithPrefs = await db.collection('users').find({
      preferredCategories: { $exists: true, $ne: [] }
    }).limit(5).toArray();

    console.log(`📊 Found ${usersWithPrefs.length} users with preferredCategories\n`);

    if (usersWithPrefs.length > 0) {
      console.log('Sample user preferredCategories:');
      usersWithPrefs.forEach((user, idx) => {
        console.log(`  User ${idx + 1} (${user.email}):`, JSON.stringify(user.preferredCategories));
      });
      console.log('');
    }

    // 2. Check merchants
    const merchantSample = await db.collection('merchants').find({
      status: 'active'
    }).limit(10).toArray();

    console.log(`🏪 Active merchants sample (${merchantSample.length}):`);
    const merchantCategories = new Set();
    const merchantSubCategories = new Set();
    merchantSample.forEach((m, idx) => {
      if (m.storeCategory) merchantCategories.add(m.storeCategory);
      if (m.storeSubCategory) merchantSubCategories.add(m.storeSubCategory);
      console.log(`  ${idx + 1}. ${m.storeName || 'Unknown'}`);
      console.log(`     Category: "${m.storeCategory}" | SubCategory: "${m.storeSubCategory}"`);
    });
    console.log(`\nUnique storeCategories: ${Array.from(merchantCategories).join(', ')}`);
    console.log(`Unique storeSubCategories: ${Array.from(merchantSubCategories).join(', ')}`);
    console.log('');

    // 3. Check offers
    const now = new Date();
    const offerSample = await db.collection('offers').find({
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).limit(10).toArray();

    console.log(`🎯 Valid offers sample (${offerSample.length}):`);
    const offerCategories = new Set();
    offerSample.forEach((o, idx) => {
      if (o.category) offerCategories.add(o.category);
      console.log(`  ${idx + 1}. ${o.title || 'Untitled'}`);
      console.log(`     Category: "${o.category}" | Merchant: "${o.merchantName}"`);
    });
    console.log(`\nUnique offer categories: ${Array.from(offerCategories).join(', ')}`);

    // Counts
    const totalValidOffers = await db.collection('offers').countDocuments({
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now }
    });
    console.log(`\n📈 Total valid offers: ${totalValidOffers}`);

    const totalActiveMerchants = await db.collection('merchants').countDocuments({ status: 'active' });
    console.log(`📈 Total active merchants: ${totalActiveMerchants}`);

    await mongoose.disconnect();
    console.log('\n✅ Investigation complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

investigate();

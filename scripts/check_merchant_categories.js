const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Check merchant category data for anomalies
 */
async function checkMerchantCategories() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    const merchants = await db.collection('merchants').find({}).toArray();

    console.log('📊 All Merchants (' + merchants.length + '):\n');

    const issues = [];

    for (const m of merchants) {
      const storeCat = m.storeCategory || '';
      const storeSub = m.storeSubCategory || '';
      
      // Check if they contain slug-like patterns (kebab-case, lowercase with dashes)
      const isSlug = (str) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(str);
      
      const storeCatSlug = isSlug(storeCat);
      const storeSubSlug = isSlug(storeSub);
      
      let statusIcon = '✅';
      if (!storeCat && !storeSub) {
        statusIcon = '❌ MISSING BOTH';
        issues.push({ id: m._id, name: m.storeName, issue: 'Both fields empty' });
      } else if (!storeCat) {
        statusIcon = '⚠️ NO storeCategory';
        issues.push({ id: m._id, name: m.storeName, issue: 'Missing storeCategory' });
      } else if (!storeSub) {
        statusIcon = '⚠️ NO storeSubCategory';
        // Not critical, but note
      }
      
      if (storeCatSlug) {
        statusIcon = '❌ SLUG STORED';
        issues.push({ id: m._id, name: m.storeName, issue: 'storeCategory is slug: ' + storeCat });
      }
      if (storeSubSlug) {
        statusIcon = '❌ SLUG STORED';
        issues.push({ id: m._id, name: m.storeName, issue: 'storeSubCategory is slug: ' + storeSub });
      }

      console.log(statusIcon + ' ' + m.storeName + ' (ID: ' + m.userId + ')');
      console.log('   storeCategory: "' + storeCat + '"');
      console.log('   storeSubCategory: "' + storeSub + '"');
      console.log('   status: ' + m.status);
    }

    if (issues.length > 0) {
      console.log('\n⚠️ ISSUES FOUND:');
      issues.forEach(issue => {
        console.log('   - ' + issue.name + ': ' + issue.issue);
      });
    } else {
      console.log('\n✅ No category data issues found');
    }

    // Also check if merchantId in offers matches userId in merchants
    console.log('\n🔗 Verifying offer->merchant linkage:');
    const offers = await db.collection('offers').find({}).limit(20).toArray();
    let brokenLinks = 0;
    for (const o of offers) {
      const merchant = await db.collection('merchants').findOne({ userId: o.merchantId });
      if (!merchant) {
        console.log('   ❌ Offer "' + o.title + '" has merchantId ' + o.merchantId + ' but no matching merchant!');
        brokenLinks++;
      }
    }
    if (brokenLinks === 0) {
      console.log('   ✅ All sampled offers have valid merchant links');
    } else {
      console.log('   ❌ Found ' + brokenLinks + ' broken links');
    }

    await mongoose.disconnect();
    console.log('\n✅ Check complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkMerchantCategories();

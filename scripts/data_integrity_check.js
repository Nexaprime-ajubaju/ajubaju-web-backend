const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Comprehensive data integrity check: offers -> merchant linkage
 */
async function checkDataIntegrity() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    const offers = await db.collection('offers').find({}).toArray();
    console.log('📊 Total offers in DB: ' + offers.length + '\n');

    const merchants = await db.collection('merchants').find({}).toArray();
    const merchantByUserId = new Map(merchants.map(m => [String(m.userId), m]));
    const merchantIdsSet = new Set(merchants.map(m => String(m.userId)));

    let brokenLinks = 0;
    let inactiveMerchantOffers = 0;
    let missingCategoryOffers = 0;

    for (const o of offers) {
      const mid = String(o.merchantId);
      const merchant = merchantByUserId.get(mid);
      if (!merchant) {
        console.log('❌ Offer "' + o.title + '" has NO merchant with userId ' + mid);
        brokenLinks++;
        continue;
      }
      if (merchant.status !== 'active') {
        console.log('   ⚠️ Offer "' + o.title + '" linked to INACTIVE merchant: ' + merchant.storeName + ' (status: ' + merchant.status + ')');
        inactiveMerchantOffers++;
      }
      if (!merchant.storeCategory && !merchant.storeSubCategory) {
        console.log('   ⚠️ Merchant "' + merchant.storeName + '" has NO category set. Offer "' + o.title + '" will not match.');
        missingCategoryOffers++;
      }
    }

    console.log('\n📊 Summary:');
    console.log('   Offers with broken merchant link: ' + brokenLinks);
    console.log('   Offers linked to inactive merchants: ' + inactiveMerchantOffers);
    console.log('   Offers whose merchants have no category: ' + missingCategoryOffers);

    // Also check for merchants with no offers
    const merchantsWithoutOffers = merchants.filter(m => {
      return !offers.some(o => String(o.merchantId) === String(m.userId));
    });
    console.log('\n🏪 Merchants without any offers: ' + merchantsWithoutOffers.length);
    merchantsWithoutOffers.forEach(m => {
      console.log('   - ' + m.storeName + ' (status: ' + m.status + ', category: ' + (m.storeCategory || 'none') + ')');
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
}

checkDataIntegrity();

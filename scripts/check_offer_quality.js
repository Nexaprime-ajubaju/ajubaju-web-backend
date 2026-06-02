const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Check offers for missing fields that might cause frontend to hide them
 */
async function checkOfferDataQuality() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    const now = new Date();
    const offers = await db.collection('offers').find({
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).toArray();

    console.log(`📊 Total valid offers: ${offers.length}\n`);

    // Check for missing critical fields
    const missingImageUrl = offers.filter(o => !o.imageUrl || o.imageUrl.trim() === '');
    const missingTitle = offers.filter(o => !o.title || o.title.trim() === '');
    const missingMerchantId = offers.filter(o => !o.merchantId);
    const missingMerchantName = offers.filter(o => !o.merchantName || o.merchantName.trim() === '');
    const missingCategory = offers.filter(o => !o.category || o.category.trim() === '');
    const missingStartDate = offers.filter(o => !o.startDate);
    const missingEndDate = offers.filter(o => !o.endDate);
    const missingTotalPrice = offers.filter(o => o.totalPrice == null);
    const missingSelectedProducts = offers.filter(o => !Array.isArray(o.selectedProducts) || o.selectedProducts.length === 0);

    console.log('🔍 Data Quality Issues:');
    console.log('   Missing imageUrl: ' + missingImageUrl.length + ' offers');
    missingImageUrl.forEach(o => console.log('      - ' + o.title + ' (merchant: ' + o.merchantName + ')'));
    
    console.log('   Missing title: ' + missingTitle.length);
    console.log('   Missing merchantId: ' + missingMerchantId.length);
    console.log('   Missing merchantName: ' + missingMerchantName.length);
    console.log('   Missing category: ' + missingCategory.length);
    console.log('   Missing startDate: ' + missingStartDate.length);
    console.log('   Missing endDate: ' + missingEndDate.length);
    console.log('   Missing totalPrice: ' + missingTotalPrice.length);
    console.log('   Missing/empty selectedProducts: ' + missingSelectedProducts.length);

    // Check selectedProducts details
    console.log('\n📦 selectedProducts Analysis:');
    offers.forEach(o => {
      if (!Array.isArray(o.selectedProducts) || o.selectedProducts.length === 0) {
        console.log(`   "${o.title}" has ${o.selectedProducts ? o.selectedProducts.length : 'undefined'} selectedProducts`);
      }
    });

    // Check offer status breakdown
    const statusCounts = {};
    offers.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });
    console.log('\n📊 Offer Status Breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    // Check category breakdown (business categories)
    const categoryCounts = {};
    offers.forEach(o => {
      const cat = o.category || 'UNKNOWN';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    console.log('\n🏷️  Offer Category Breakdown:');
    Object.entries(categoryCounts).sort((a,b) => b[1] - a[1]).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Check complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkOfferDataQuality();

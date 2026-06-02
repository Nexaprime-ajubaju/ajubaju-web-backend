const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Analyze offer data completeness by status and category
 */
async function analyzeOffers() {
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

    console.log('📊 Total valid offers: ' + offers.length + '\n');

    // Group by status
    const byStatus = {};
    // Group by business category vs promotional
    const businessCategories = new Set(['Food & Dining', 'Shopping & Retail', 'Hotels & Accommodation', 'Education & Training', 'Automotive Services', 'Home Services', 'Beauty & Wellness', 'Healthcare', 'Real Estate', 'Events & Entertainment', 'Professional Services', 'Fitness & Sports', 'Daily Needs', 'Local Businesses & Vendors']);
    const promotionalCategories = new Set(['Special', 'Flash Sale', 'Combo', 'Clearance', 'Weekend Offer', 'Member Exclusive', 'Limited Time', 'Festival', 'Clearance Sale']);

    const stats = {
      total: offers.length,
      active: 0,
      under_review: 0,
      withImage: 0,
      withoutImage: 0,
      businessCategory: 0,
      promotionalCategory: 0,
      unknownCategory: 0,
      withSelectedProducts: 0,
      withoutSelectedProducts: 0
    };

    console.log('Offer breakdown:\n');
    for (const o of offers) {
      // Status
      if (o.status === 'active') stats.active++;
      else if (o.status === 'under_review') stats.under_review++;

      // Image
      if (o.imageUrl && o.imageUrl.trim() !== '') stats.withImage++;
      else stats.withoutImage++;

      // Category type
      const cat = (o.category || '').trim();
      if (businessCategories.has(cat)) stats.businessCategory++;
      else if (promotionalCategories.has(cat)) stats.promotionalCategory++;
      else stats.unknownCategory++;

      // Selected products
      if (Array.isArray(o.selectedProducts) && o.selectedProducts.length > 0) stats.withSelectedProducts++;
      else stats.withoutSelectedProducts++;

      if (o.status === 'active' && !o.imageUrl) {
        console.log('   ❌ Active offer missing image: "' + o.title + '" (' + cat + ') by ' + o.merchantName);
      }
    }

    console.log('Status:');
    console.log('   Active: ' + stats.active);
    console.log('   Under Review: ' + stats.under_review);
    console.log('');
    console.log('Image:');
    console.log('   With imageUrl: ' + stats.withImage);
    console.log('   Without imageUrl: ' + stats.withoutImage + ' ⚠️');
    console.log('');
    console.log('Category Type:');
    console.log('   Business categories: ' + stats.businessCategory);
    console.log('   Promotional categories: ' + stats.promotionalCategory);
    console.log('   Unknown categories: ' + stats.unknownCategory + ' (might be custom/typo)');
    console.log('');
    console.log('Selected Products:');
    console.log('   With products: ' + stats.withSelectedProducts);
    console.log('   Without products: ' + stats.withoutSelectedProducts + ' ⚠️');

    // Check offers that would be visible to users (active + has image + has products)
    const userVisible = offers.filter(o => 
      o.status === 'active' && 
      o.imageUrl && o.imageUrl.trim() !== '' && 
      Array.isArray(o.selectedProducts) && o.selectedProducts.length > 0
    ).length;
    console.log('\n👁️ Offers likely visible to users (active + image + products): ' + userVisible + ' / ' + offers.length);

    await mongoose.disconnect();
    console.log('\n✅ Analysis complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

analyzeOffers();

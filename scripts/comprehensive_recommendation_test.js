const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Comprehensive test to debug recommendation matching
 * Tests both Path A (offer.category matches) and Path B (merchant storeCategory matches)
 */
async function comprehensiveTest() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Fetch a real user with preferences
    const user = await db.collection('users').findOne({
      preferredCategories: { $exists: true, $ne: [] }
    });

    if (!user) {
      console.log('❌ No user with preferredCategories found');
      return;
    }

    console.log(`👤 Testing with user: ${user.email} (ID: ${user._id})`);
    console.log(`   Preferred Categories: ${JSON.stringify(user.preferredCategories)}\n`);

    // === STEP 1: Build matchTerms (simulating the service logic) ===
    const categoryAliases = {
      'food-restaurants': ['Food & Dining', 'Food & Restaurants', 'Food', 'Restaurant', 'Restaurants', 'Cafe', 'Cafes', 'Dining'],
      'home-services': ['Home Services', 'Home Improvement', 'Repair', 'Maintenance', 'Cleaning'],
      'beauty-wellness': ['Beauty', 'Beauty & Wellness', 'Salon', 'Salons', 'Spa', 'Wellness'],
      'healthcare-medical': ['Healthcare', 'Medical', 'Clinic', 'Clinics', 'Hospital', 'Hospitals', 'Pharmacy'],
      'hotels-accommodation': ['Hotels & Accommodation', 'Hotel', 'Hotels', 'Accommodation', 'Travel'],
      'shopping-retail': ['Shopping & Retail', 'Shopping', 'Retail', 'Fashion', 'Apparel'],
      'education-training': ['Education & Training', 'Education', 'Training', 'Courses', 'Institute'],
      'real-estate': ['Real Estate', 'Property', 'Properties', 'Housing'],
      'events-entertainment': ['Events & Entertainment', 'Events', 'Entertainment', 'Ticket', 'Tickets'],
      'professional-services': ['Professional Services', 'Services', 'Consulting'],
      'automotive-services': ['Automotive Services', 'Automotive', 'Vehicle', 'Vehicles'],
      'home-improvement': ['Home Improvement', 'Home Services', 'Renovation', 'Repair'],
      'fitness-sports': ['Fitness & Sports', 'Fitness', 'Sports', 'Gym', 'Workout'],
      'daily-needs': ['Daily Needs & Utilities', 'Daily Needs', 'Utilities', 'Grocery', 'Groceries'],
      'local-businesses-vendors': ['Local Businesses & Vendors', 'Local Businesses', 'Vendors', 'Marketplace'],
    };

    function normalizeCategory(value) {
      return String(value || '').trim().toLowerCase();
    }

    function getAliasGroups() {
      const aliasGroups = new Map();
      for (const [key, aliases] of Object.entries(categoryAliases)) {
        const allTerms = [key, ...aliases];
        for (const term of allTerms) {
          const norm = normalizeCategory(term);
          const compact = norm.replace(/[^a-z0-9]+/g, ' ').trim();
          if (norm) aliasGroups.set(norm, aliases);
          if (compact) aliasGroups.set(compact, aliases);
        }
      }
      return aliasGroups;
    }

    function buildMatchTerms(preferredCategories) {
      const terms = new Set();
      const aliasGroups = getAliasGroups();

      for (const category of preferredCategories) {
        const normalized = normalizeCategory(category);
        if (!normalized) continue;

        terms.add(category.trim());
        terms.add(normalized);

        let matchedAliases = [];
        if (aliasGroups.has(normalized)) {
          matchedAliases = aliasGroups.get(normalized);
        } else {
          for (const [key, aliases] of Object.entries(categoryAliases)) {
            if (aliases.some(alias => normalizeCategory(alias) === normalized)) {
              matchedAliases = aliases;
              break;
            }
          }
        }

        for (const alias of matchedAliases) {
          terms.add(alias);
        }

        const compact = normalized.replace(/[^a-z0-9]+/g, ' ').trim();
        if (compact) terms.add(compact);
      }

      return Array.from(terms).filter(Boolean);
    }

    const matchTerms = buildMatchTerms(user.preferredCategories);
    console.log(`🎯 Built matchTerms (${matchTerms.length} terms):`);
    console.log(`   ${matchTerms.join(', ')}\n`);

    // === STEP 2: Find matching active merchants ===
    const now = new Date();
    const matchedMerchants = await db.collection('merchants').find({
      status: 'active',
      $or: [
        { storeCategory: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
        { storeSubCategory: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
      ],
    }).limit(10).toArray();

    console.log(`🏪 Matched Merchants (${matchedMerchants.length}):`);
    matchedMerchants.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.storeName}`);
      console.log(`      storeCategory: "${m.storeCategory}" | storeSubCategory: "${m.storeSubCategory}"`);
      console.log(`      userId: ${m.userId} | status: ${m.status}`);
    });
    console.log('');

    if (matchedMerchants.length === 0) {
      console.log('❌ NO MERCHANTS MATCHED! This is the problem.');
      console.log('   Checking why...');
      
      // Show all active merchants and their categories for comparison
      const allActiveMerchants = await db.collection('merchants').find({
        status: 'active'
      }).toArray();
      
      console.log(`\n📋 All active merchants (${allActiveMerchants.length}):`);
      allActiveMerchants.forEach((m, idx) => {
        const storeCatMatch = matchTerms.some(term => 
          new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(m.storeCategory || '')
        );
        const storeSubMatch = matchTerms.some(term => 
          new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(m.storeSubCategory || '')
        );
        console.log(`   ${idx + 1}. ${m.storeName} | Category: "${m.storeCategory}" | Sub: "${m.storeSubCategory}"`);
        console.log(`      Matches? storeCategory: ${storeCatMatch ? '✅' : '❌'}, storeSubCategory: ${storeSubMatch ? '✅' : '❌'}`);
      });
    }

    // === STEP 3: Get offers from matched merchants ===
    const merchantIds = matchedMerchants.map(m => String(m.userId));
    console.log(`🔗 Merchant IDs for offer query: ${merchantIds.join(', ')}\n`);

    const offerQuery = {
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { merchantId: { $in: merchantIds } },
        { category: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
      ],
    };

    const offers = await db.collection('offers').find(offerQuery)
      .limit(20)
      .toArray();

    console.log(`🎁 Offers found: ${offers.length}`);
    offers.forEach((o, idx) => {
      console.log(`   ${idx + 1}. ${o.title}`);
      console.log(`      Category: "${o.category}" | Merchant: "${o.merchantName}" (ID: ${o.merchantId})`);
      console.log(`      Status: ${o.status} | Dates: ${o.startDate.toISOString().split('T')[0]} to ${o.endDate.toISOString().split('T')[0]}`);
    });
    console.log('');

    // === STEP 4: Diagnose issues ===
    console.log('🔍 DIAGNOSIS:');
    
    // Check 1: Are merchant IDs properly linked?
    const merchantIdSet = new Set(merchantIds);
    const offersWithMatchedMerchants = offers.filter(o => merchantIdSet.has(String(o.merchantId)));
    console.log(`   Offers from matched merchants: ${offersWithMatchedMerchants.length}/${offers.length}`);
    
    // Check 2: Are offers expiring soon or with wrong status?
    const expiredOffers = offers.filter(o => o.endDate < now);
    const invalidStatus = offers.filter(o => !['under_review', 'approved', 'active'].includes(o.status));
    console.log(`   Expired offers: ${expiredOffers.length}`);
    console.log(`   Invalid status offers: ${invalidStatus.length}`);
    
    // Check 3: Do offers have category values that match directly?
    const directCategoryMatches = offers.filter(o => 
      matchTerms.some(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o.category || ''))
    );
    console.log(`   Offers matching via category field: ${directCategoryMatches.length}/${offers.length}`);
    
    // Check 4: Are matched merchants actually linked to offers?
    const merchantIdsWithOffers = new Set(offers.map(o => String(o.merchantId)));
    const matchedMerchantsWithOffers = matchedMerchants.filter(m => merchantIdsWithOffers.has(String(m.userId)));
    console.log(`   Matched merchants that have offers: ${matchedMerchantsWithOffers.length}/${matchedMerchants.length}`);

    // === STEP 5: Show detailed merchant -> offer mapping ===
    console.log('\n📊 Merchant -> Offer Mapping:');
    for (const merchant of matchedMerchants) {
      const merchantOffers = offers.filter(o => String(o.merchantId) === String(merchant.userId));
      console.log(`   ${merchant.storeName} (${merchant.userId}): ${merchantOffers.length} offers`);
      if (merchantOffers.length === 0) {
        // Check if this merchant has ANY offers in DB
        const allMerchantOffers = await db.collection('offers').find({
          merchantId: { $eq: merchant.userId }
        }).count();
        console.log(`      (Total offers in DB for this merchant: ${allMerchantOffers})`);
        
        // Check offer status/dates for this merchant
        const validOffers = await db.collection('offers').find({
          merchantId: { $eq: merchant.userId },
          status: { $in: ['under_review', 'approved', 'active'] },
          startDate: { $lte: now },
          endDate: { $gte: now }
        }).count();
        console.log(`      (Offers with valid status/dates: ${validOffers})`);
      }
    }

    // === STEP 6: Check if merchantId in offers matches userId in merchants ===
    console.log('\n🔗 Merchant ID Linkage Check:');
    const allOffers = await db.collection('offers').find({}).limit(5).toArray();
    for (const o of allOffers) {
      const linkedMerchant = await db.collection('merchants').findOne({ userId: o.merchantId });
      console.log(`   Offer: "${o.title}" | merchantId: ${o.merchantId}`);
      console.log(`   Linked merchant found: ${linkedMerchant ? '✅ ' + linkedMerchant.storeName : '❌ NOT FOUND'}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

comprehensiveTest();

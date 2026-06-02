// Test script to verify recommendations fix
const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

// Simple standalone version of the fixed buildMatchTerms
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

function buildMatchTerms_fixed(preferredCategories, categoryAliases) {
  const terms = new Set();

  // Pre-build alias groups map: normalized term -> aliases
  const aliasGroups = new Map();
  for (const [key, aliases] of Object.entries(categoryAliases)) {
    const allTerms = [key, ...aliases];
    for (const term of allTerms) {
      const norm = normalizeCategory(term);
      if (norm) {
        aliasGroups.set(norm, aliases);
      }
    }
  }

  for (const category of preferredCategories) {
    const normalized = normalizeCategory(category);
    if (!normalized) continue;

    terms.add(category.trim());
    terms.add(normalized);

    let matchedAliases = [];
    if (aliasGroups.has(normalized)) {
      matchedAliases = aliasGroups.get(normalized);
    } else {
      // Fallback: check if category matches any alias value exactly
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
    if (compact) {
      terms.add(compact);
    }
  }

  return Array.from(terms).filter(Boolean);
}

function matchesAnyTerm(value, terms) {
  const normalizedValue = normalizeCategory(value);
  if (!normalizedValue || !terms.length) return false;
  return terms.some((term) => {
    const normalizedTerm = normalizeCategory(term);
    return normalizedValue === normalizedTerm || normalizedValue.includes(normalizedTerm) || normalizedTerm.includes(normalizedValue);
  });
}

async function testWithRealData() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // Get a user with preferredCategories
  const user = await db.collection('users').findOne({
    preferredCategories: { $exists: true, $ne: [] }
  });

  console.log(`👤 Test User: ${user.email}`);
  console.log(`   Preferred Categories: ${JSON.stringify(user.preferredCategories)}`);
  console.log('');

  const matchTerms = buildMatchTerms_fixed(user.preferredCategories, categoryAliases);
  console.log(`🔤 Match Terms (${matchTerms.length}):`);
  console.log('   ', matchTerms.join(' | '));
  console.log('');

  // Get active merchants and check matching
  const merchants = await db.collection('merchants').find({ status: 'active' }).toArray();
  console.log(`🏪 Checking ${merchants.length} active merchants:`);

  let matchedMerchants = [];
  merchants.forEach(m => {
    const catMatch = matchesAnyTerm(m.storeCategory, matchTerms);
    const subMatch = matchesAnyTerm(m.storeSubCategory, matchTerms);
    const isMatch = catMatch || subMatch;
    if (isMatch) {
      matchedMerchants.push(m);
      console.log(`   ✅ ${m.storeName}: category="${m.storeCategory}" sub="${m.storeSubCategory}"`);
    } else {
      console.log(`   ❌ ${m.storeName}: category="${m.storeCategory}" sub="${m.storeSubCategory}"`);
    }
  });
  console.log(`\n✅ Matched Merchants: ${matchedMerchants.length}/${merchants.length}`);

  // Get offer count
  const now = new Date();
  const merchantIds = matchedMerchants.map(m => String(m.userId));
  
  const offerQuery = {
    status: { $in: ['under_review', 'approved', 'active'] },
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [
      { merchantId: { $in: merchantIds } },
      { category: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } }
    ]
  };

  const matchingOffers = await db.collection('offers').find(offerQuery).toArray();
  console.log(`\n🎯 Matching Offers: ${matchingOffers.length}`);
  matchingOffers.forEach(o => {
    console.log(`   - ${o.title} (category: "${o.category}", merchant: "${o.merchantName}")`);
  });

  console.log('\n✅ Test complete');

  await mongoose.disconnect();
}

testWithRealData().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

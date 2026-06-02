// Comprehensive test for the fixed buildMatchTerms
const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

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

async function comprehensiveTest() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // Test Users
  const users = await db.collection('users').find({
    preferredCategories: { $exists: true, $ne: [] }
  }).toArray();

  console.log(`📊 Found ${users.length} users with preferences\n`);

  const aliasGroups = getAliasGroups();
  console.log('🔍 Alias Groups sample entries:');
  for (const [key, value] of aliasGroups.entries()) {
    console.log(`   "${key}" → [${value.slice(0, 3).join(', ')}...]`);
    if (Array.from(aliasGroups.keys()).length > 10) break;
  }
  console.log(`\nTotal alias group keys: ${aliasGroups.size}\n`);

  for (const user of users) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`User: ${user.email}`);
    console.log(`Preferences: ${JSON.stringify(user.preferredCategories)}`);

    const matchTerms = buildMatchTerms(user.preferredCategories);
    console.log(`\nMatch Terms (${matchTerms.length} total):`);
    
    // Group by source category for clarity
    user.preferredCategories.forEach((pref, idx) => {
      const prefNorm = normalizeCategory(pref);
      const related = matchTerms.filter(t => {
        const tNorm = normalizeCategory(t);
        return tNorm === prefNorm || 
               tNorm.includes(prefNorm.split(' ')[0]) || 
               prefNorm.includes(tNorm.split(' ')[0]);
      });
      console.log(`  From "${pref}": ${related.slice(0, 6).join(', ')}${related.length > 6 ? '...' : ''}`);
    });

    // Check merchants
    const merchants = await db.collection('merchants').find({ status: 'active' }).toArray();
    console.log(`\nMerchant Matching:`);
    let matchedCount = 0;
    merchants.forEach(m => {
      const catMatch = matchesAnyTerm(m.storeCategory, matchTerms);
      const subMatch = matchesAnyTerm(m.storeSubCategory, matchTerms);
      if (catMatch || subMatch) {
        matchedCount++;
        console.log(`  ✅ ${m.storeName}: category="${m.storeCategory}" sub="${m.storeSubCategory}"`);
      }
    });
    console.log(`  Matched ${matchedCount}/${merchants.length} merchants`);

    // Check offers
    const now = new Date();
    const matchedMerchantIds = merchants
      .filter(m => matchesAnyTerm(m.storeCategory, matchTerms) || matchesAnyTerm(m.storeSubCategory, matchTerms))
      .map(m => String(m.userId));

    const offerQuery = {
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { merchantId: { $in: matchedMerchantIds } },
        { category: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } }
      ]
    };

    const matchingOffers = await db.collection('offers').find(offerQuery).count();
    console.log(`  Matching offers count: ${matchingOffers}`);
  }

  console.log('\n\n✅ All users tested successfully');
  await mongoose.disconnect();
}

comprehensiveTest().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

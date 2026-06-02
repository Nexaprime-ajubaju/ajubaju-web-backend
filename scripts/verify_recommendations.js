const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function testRecommendations() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  // Get a test user with preferences
  const user = await db.collection('users').findOne({
    preferredCategories: { $exists: true, $ne: [] }
  });

  if (!user) {
    console.log('No user with preferences found');
    await mongoose.disconnect();
    return;
  }

  console.log(`Test User: ${user.email}`);
  console.log(`Preferred Categories: ${JSON.stringify(user.preferredCategories)}`);
  console.log(`UserId: ${user._id}\n`);

  // Manually replicate the service logic (simplified)
  const preferredCategories = user.preferredCategories;
  
  // Category aliases (same as service)
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
      for (const alias of matchedAliases) terms.add(alias);
      const compact = normalized.replace(/[^a-z0-9]+/g, ' ').trim();
      if (compact) terms.add(compact);
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

  const matchTerms = buildMatchTerms(preferredCategories);
  console.log(`Match Terms (${matchTerms.length}):`, matchTerms.slice(0, 20).join(', '));

  // Find matching active merchants
  const now = new Date();
  const merchants = await db.collection('merchants').find({
    status: 'active'
  }).toArray();

  const matchedMerchants = merchants.filter(m => 
    matchesAnyTerm(m.storeCategory, matchTerms) || matchesAnyTerm(m.storeSubCategory, matchTerms)
  );
  console.log(`\nMatched ${matchedMerchants.length}/${merchants.length} merchants:`);
  matchedMerchants.forEach(m => {
    console.log(`  - ${m.storeName} (${m.storeCategory} / ${m.storeSubCategory})`);
  });

  const merchantIds = matchedMerchants.map(m => String(m.userId));

  // Find offers
  const offerQuery = {
    status: { $in: ['under_review', 'approved', 'active'] },
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [
      { merchantId: { $in: merchantIds } },
      { category: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } }
    ]
  };

  const offerRows = await db.collection('offers').find(offerQuery).toArray();
  console.log(`\nOffers from query (before category re-filter): ${offerRows.length}`);

  // Apply the final category match filter (like the service does)
  const filteredOffers = [];
  for (const row of offerRows) {
    const merchant = merchants.find(m => String(m.userId) === String(row.merchantId));
    const allTerms = [
      String(row.category || ''),
      String(merchant?.storeCategory || ''),
      String(merchant?.storeSubCategory || ''),
    ].filter(Boolean);
    
    const matchedCategories = preferredCategories.filter((category) => {
      const normalized = normalizeCategory(category);
      const aliases = buildMatchTerms([category]);
      return allTerms.some((field) => matchesAnyTerm(field, aliases)) || matchesAnyTerm(normalized, allTerms);
    });
    
    if (matchedCategories.length > 0) {
      filteredOffers.push(row);
    }
  }
  
  console.log(`Offers after final category filter: ${filteredOffers.length}`);
  if (filteredOffers.length > 0) {
    console.log('\nSample deals that would be recommended:');
    filteredOffers.slice(0, 5).forEach(o => {
      console.log(`  - ${o.title} (category: "${o.category}", merchant: ${o.merchantName})`);
    });
  }

  await mongoose.disconnect();
}

testRecommendations().catch(err => {
  console.error(err);
  process.exit(1);
});

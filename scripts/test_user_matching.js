const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function simulateRecommendationForUser(userPrefs) {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  // Get user with prefs
  const user = await db.collection('users').findOne({ preferredCategories: { $exists: true, $ne: [] } });
  if (!user) {
    console.log('No user with preferences');
    await mongoose.disconnect();
    return;
  }

  const preferredCategories = user.preferredCategories;
  console.log(`User: ${user.email}`);
  console.log(`Prefs: ${JSON.stringify(preferredCategories)}`);

  // Build matchTerms (same as service)
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

  // Get all active merchants
  const merchants = await db.collection('merchants').find({ status: 'active' }).toArray();
  const matchedMerchants = merchants.filter(m =>
    matchesAnyTerm(m.storeCategory, matchTerms) || matchesAnyTerm(m.storeSubCategory, matchTerms)
  );
  const merchantIds = matchedMerchants.map(m => String(m.userId));

  console.log(`\nMatched ${matchedMerchants.length}/${merchants.length} merchants`);

  // Get all valid offers
  const now = new Date();
  const offerRows = await db.collection('offers').find({
    status: { $in: ['under_review', 'approved', 'active'] },
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).toArray();

  console.log(`Total valid offers in DB: ${offerRows.length}`);

  // Manual filtering to see which would pass
  const results = [];
  for (const row of offerRows) {
    const merchant = merchants.find(m => String(m.userId) === String(row.merchantId));
    const allTerms = [
      String(row.category || ''),
      String(row.businessCategory || ''),
      String(row.businessSubCategory || ''),
      String(merchant?.storeCategory || ''),
      String(merchant?.storeSubCategory || ''),
    ].filter(Boolean);

    const matchedCategories = preferredCategories.filter((category) => {
      const normalized = normalizeCategory(category);
      const aliases = buildMatchTerms([category]);
      return allTerms.some((field) => matchesAnyTerm(field, aliases)) || matchesAnyTerm(normalized, allTerms);
    });

    if (matchedCategories.length > 0) {
      results.push({
        title: row.title,
        category: row.category,
        businessCategory: row.businessCategory,
        merchantStoreCat: merchant?.storeCategory,
        matchedCategories
      });
    }
  }

  console.log(`\nOffers that would be recommended: ${results.length}`);
  results.forEach(r => {
    console.log(` - ${r.title} (cat: "${r.category}", bizCat: "${r.businessCategory}", merchantCat: "${r.merchantStoreCat}")`);
    console.log(`   matched: ${r.matchedCategories.join(', ')}`);
  });

  await mongoose.disconnect();
}

// Test with user that has prefs
simulateRecommendationForUser();
} catch (err) {
  console.error(err);
  process.exit(1);
}

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Test ALL users to see if any have preferences that match zero merchants
 */
async function testAllUsers() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Get all users with preferredCategories
    const users = await db.collection('users').find({
      preferredCategories: { $exists: true, $ne: [] }
    }).toArray();

    console.log(`👥 Total users with preferences: ${users.length}\n`);

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

    const now = new Date();
    const results = [];

    for (const user of users) {
      const matchTerms = buildMatchTerms(user.preferredCategories);
      
      const matchedMerchants = await db.collection('merchants').countDocuments({
        status: 'active',
        $or: [
          { storeCategory: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
          { storeSubCategory: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
        ],
      });

      const merchantIds = []; // simplified
      const offers = matchedMerchants > 0 ? await db.collection('offers').countDocuments({
        status: { $in: ['under_review', 'approved', 'active'] },
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [
          { merchantId: { $in: merchantIds } }, // will be empty, but also check direct category match
          { category: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
        ],
      }) : 0;

      results.push({
        email: user.email,
        preferredCategories: user.preferredCategories,
        matchedMerchants,
        offersCount: offers,
        status: matchedMerchants === 0 ? '❌ NO MERCHANT MATCH' : (offers === 0 ? '⚠️ NO OFFERS' : '✅ OK')
      });
    }

    console.log('\n📊 User Recommendation Health Check:\n');
    results.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.email}`);
      console.log(`   Prefs: ${JSON.stringify(r.preferredCategories)}`);
      console.log(`   Matched Merchants: ${r.matchedMerchants} | Offers: ${r.offersCount} | ${r.status}`);
    });

    const noMerchantMatches = results.filter(r => r.matchedMerchants === 0);
    const noOffers = results.filter(r => r.matchedMerchants > 0 && r.offersCount === 0);

    console.log('\nSummary:');
    console.log('   Users with NO matching merchants: ' + noMerchantMatches.length);
    console.log('   Users with merchants but NO offers: ' + noOffers.length);

    if (noMerchantMatches.length > 0) {
      console.log('\nUsers with no merchant matches (their preferences do not align with any active merchant):');
      noMerchantMatches.forEach(r => console.log('   - ' + r.email + ': ' + JSON.stringify(r.preferredCategories)));
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

testAllUsers();

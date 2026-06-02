const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Simulate exact getRecommendedDeals execution for a specific user
 * Including the post-processing filtering and ranking
 */
async function debugFullPipeline() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Use the same user from earlier
    const userId = '69fae7223ce49a006cb548fa';
    console.log('🔍 Debugging getRecommendedDeals for userId: ' + userId + '\n');

    // Fetch user
    const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) });
    if (!user) {
      console.log('User not found');
      return;
    }

    const preferredCategories = Array.isArray(user.preferredCategories)
      ? user.preferredCategories.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
      : [];

    console.log('User preferredCategories:', JSON.stringify(preferredCategories));

    // Same categoryAliases and buildMatchTerms from service
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

    function matchesAnyTerm(value, terms) {
      const normalizedValue = normalizeCategory(value);
      if (!normalizedValue || !terms.length) return false;

      return terms.some((term) => {
        const normalizedTerm = normalizeCategory(term);
        return normalizedValue === normalizedTerm || normalizedValue.includes(normalizedTerm) || normalizedTerm.includes(normalizedValue);
      });
    }

    const matchTerms = buildMatchTerms(preferredCategories);
    console.log('Match terms count: ' + matchTerms.length);

    // Query offers (same as service)
    const now = new Date();
    const query = {
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now },
    };

    const matchedMerchants = await db.collection('merchants').find({
      status: 'active',
      $or: [
        { storeCategory: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
        { storeSubCategory: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
      ],
    }, {
      projection: { userId: 1, storeName: 1, storeCategory: 1, storeSubCategory: 1, _id: 0 }
    }).toArray();

    const merchantIds = matchedMerchants.map((merchant) => String(merchant.userId));
    console.log('Matched merchant IDs: ' + merchantIds.join(', '));

    const offerRows = await db.collection('offers').find({
      ...query,
      $or: [
        { merchantId: { $in: merchantIds } },
        { category: { $in: matchTerms.map(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) } },
      ],
    }, {
      projection: {
        requestId: 1, merchantId: 1, merchantName: 1, title: 1, category: 1,
        totalPrice: 1, startDate: 1, endDate: 1, status: 1, createdAt: 1,
        imageUrl: 1, selectedProducts: 1, _id: 0
      }
    }).sort({ createdAt: -1 }).limit(300).toArray();

    console.log('Total offers from DB query (before post-filter): ' + offerRows.length);

    // Post-processing filter (exact copy from service)
    const merchantsByUserId = new Map(matchedMerchants.map((merchant) => [String(merchant.userId), merchant]));
    const groupedByCategory = new Map();

    for (const row of offerRows) {
      const merchant = merchantsByUserId.get(String(row.merchantId));
      const allTerms = [
        String(row.category || ''),
        String(merchant?.storeCategory || ''),
        String(merchant?.storeSubCategory || ''),
      ].filter(Boolean);

      console.log('\n🏷️  Offer: ' + row.title);
      console.log('   category: "' + row.category + '"');
      console.log('   merchant.storeCategory: "' + (merchant?.storeCategory || 'N/A') + '"');
      console.log('   merchant.storeSubCategory: "' + (merchant?.storeSubCategory || 'N/A') + '"');
      console.log('   allTerms: [' + allTerms.join(', ') + ']');

      // Show the matching check for each preference
      for (const pref of preferredCategories) {
        const aliases = buildMatchTerms([pref]);
        const anyMatch = allTerms.some((field) => matchesAnyTerm(field, aliases)) || matchesAnyTerm(normalizeCategory(pref), allTerms);
        if (anyMatch) {
          console.log('   ✅ Matches user pref: "' + pref + '"');
        }
      }

      const matchedCategories = preferredCategories.filter((category) => {
        const normalized = normalizeCategory(category);
        const aliases = buildMatchTerms([category]);
        return allTerms.some((field) => matchesAnyTerm(field, aliases)) || matchesAnyTerm(normalized, allTerms);
      });

      console.log('   Matched categories count: ' + matchedCategories.length);

      if (!matchedCategories.length) {
        console.log('   ❌ FILTERED OUT - No matching categories');
        continue;
      }

      const bestCategory = matchedCategories[0];
      console.log('   ✅ PASSED - bestCategory: "' + bestCategory + '"');

      if (!groupedByCategory.has(bestCategory)) {
        groupedByCategory.set(bestCategory, []);
      }
      groupedByCategory.get(bestCategory).push(row);
    }

    console.log('\n📊 After post-processing filtering:');
    let totalPassed = 0;
    for (const [cat, rows] of groupedByCategory.entries()) {
      console.log('   Category "' + cat + '": ' + rows.length + ' offers');
      totalPassed += rows.length;
    }
    console.log('   Total: ' + totalPassed + ' offers');

    // Show final result with pagination
    const sortedGroups = Array.from(groupedByCategory.values()).map((group) =>
      group.sort((a, b) => b.score - a.score || new Date(b.startsAt || 0).getTime() - new Date(a.startsAt || 0).getTime())
    );
    const mixedRows = sortedGroups.flat(); // simplified, skip roundRobin
    console.log('\n📋 Final offers that would be returned (no pagination): ' + mixedRows.length);

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

debugFullPipeline();

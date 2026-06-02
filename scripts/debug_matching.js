// Simulate the RecommendationsService buildMatchTerms logic
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

function buildMatchTerms_original(preferredCategories) {
  const terms = new Set();

  for (const category of preferredCategories) {
    const normalized = normalizeCategory(category);
    if (!normalized) continue;

    terms.add(category.trim());
    terms.add(normalized);

    const aliases = categoryAliases[normalized] || [];
    for (const alias of aliases) {
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

// Test with actual user data
const testUsers = [
  { email: 'NewUsser45@gmail.com', preferredCategories: ["Food & Restaurants","Hotels & Accommodation","Education & Training","Events & Entertainment","Shopping & Retail","Automotive Services"] },
  { email: 'NewUssdser45@gmail.com', preferredCategories: ["Food & Dining","Hotels & Accommodation","Education & Training","Home Services","Shopping & Retail","Automotive Services"] },
];

const merchants = [
  { storeName: 'Pizza Palace', storeCategory: 'Food & Dining', storeSubCategory: 'Pizzas' },
  { storeName: 'Cafe Delight', storeCategory: 'Food & Dining', storeSubCategory: 'Cafes' },
  { storeName: 'Salon Elegance', storeCategory: 'Beauty & Wellness', storeSubCategory: 'Salon' },
  { storeName: 'Fashion Hub', storeCategory: 'Shopping & Retail', storeSubCategory: 'Fashion' },
  { storeName: 'Blinkit', storeCategory: 'Home Services', storeSubCategory: 'Home Delivery' },
];

console.log('🔍 DEBUGGING CATEGORY MATCHING\n');

testUsers.forEach((user, userIdx) => {
  console.log(`\n=== User ${userIdx + 1}: ${user.email} ===`);
  console.log('Preferred Categories:', JSON.stringify(user.preferredCategories));

  const matchTerms = buildMatchTerms_original(user.preferredCategories);
  console.log('\nMatch Terms generated:');
  console.log('  ', matchTerms.join(' | '));

  console.log('\n--- Matching Test with Merchants ---');
  merchants.forEach(merchant => {
    const categoryMatch = matchesAnyTerm(merchant.storeCategory, matchTerms);
    const subCategoryMatch = matchesAnyTerm(merchant.storeSubCategory, matchTerms);

    console.log(`\nMerchant: ${merchant.storeName}`);
    console.log(`  storeCategory: "${merchant.storeCategory}" → ${categoryMatch ? '✅ MATCH' : '❌ no match'}`);
    console.log(`  storeSubCategory: "${merchant.storeSubCategory}" → ${subCategoryMatch ? '✅ MATCH' : '❌ no match'}`);

    // Show why it matches or not
    if (categoryMatch || subCategoryMatch) {
      const allValues = [merchant.storeCategory, merchant.storeSubCategory].filter(Boolean);
      for (const val of allValues) {
        for (const term of matchTerms) {
          const nVal = normalizeCategory(val);
          const nTerm = normalizeCategory(term);
          if (nVal === nTerm || nVal.includes(nTerm) || nTerm.includes(nVal)) {
            console.log(`    → Match: "${val}" vs term "${term}" (normalized: "${nVal}" vs "${nTerm}")`);
            break;
          }
        }
      }
    }
  });
});

console.log('\n\n=== ANALYSIS ===');
console.log('For user with "Food & Dining":');
console.log('  - normalized = "food & dining"');
console.log('  - categoryAliases lookup key: "food & dining"');
console.log('  - available keys: food-restaurants, home-services, beauty-wellness, etc.');
console.log('  ❌ KEY MISMATCH: User stores full label "Food & Dining" but aliases use slug keys like "food-restaurants"');
console.log('\nWhat terms get added for "Food & Dining"?');
const terms = buildMatchTerms_original(["Food & Dining"]);
console.log('  ', terms.join(', '));
console.log('\nNotice: NO "Restaurant", "Cafe", "Pizzas", etc. because aliases are never applied!');
console.log('\nThe fix: categoryAliases should be keyed by normalized full labels OR we need bidirectional lookup.');

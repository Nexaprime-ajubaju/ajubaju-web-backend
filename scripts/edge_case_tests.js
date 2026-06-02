// Edge case tests for buildMatchTerms
const categoryAliases = {
  'food-restaurants': ['Food & Dining', 'Food & Restaurants', 'Food', 'Restaurant', 'Restaurants', 'Cafe', 'Cafes', 'Dining'],
  'shopping-retail': ['Shopping & Retail', 'Shopping', 'Retail', 'Fashion', 'Apparel'],
  'events-entertainment': ['Events & Entertainment', 'Events', 'Entertainment', 'Ticket', 'Tickets'],
  'education-training': ['Education & Training', 'Education', 'Training', 'Courses', 'Institute'],
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

// Edge case tests
const testCases = [
  { pref: 'Food & Dining', merchantCat: 'Restaurant', expect: true },
  { pref: 'Food & Dining', merchantCat: 'Cafe', expect: true },
  { pref: 'Food & Restaurants', merchantCat: 'Restaurant', expect: true },
  { pref: 'Food & Restaurants', merchantCat: 'Food & Dining', expect: true },
  { pref: 'Shopping & Retail', merchantCat: 'Fashion', expect: true },
  { pref: 'Events & Entertainment', merchantCat: 'Events', expect: true },
  { pref: 'Education & Training', merchantCat: 'Courses', expect: true },
  { pref: 'Food', merchantCat: 'Restaurant', expect: true },
  { pref: 'Restaurant', merchantCat: 'Food & Dining', expect: true },
  { pref: 'Salon', merchantCat: 'Beauty & Wellness', expect: false }, // Not in aliases shared between
];

console.log('🧪 Edge Case Tests\n');
let passed = 0, failed = 0;

testCases.forEach(({ pref, merchantCat, expect }) => {
  const terms = buildMatchTerms([pref]);
  const result = matchesAnyTerm(merchantCat, terms);
  const pass = result === expect;
  console.log(`${pass ? '✅' : '❌'} pref="${pref}" vs merchantCat="${merchantCat}" => ${result} (expected ${expect})`);
  if (pass) passed++; else failed++;
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);

// Show aliasGroups keys for food category
console.log('\n\nAlias group keys for food category:');
const aliasGroups = getAliasGroups();
const foodKeys = Array.from(aliasGroups.keys()).filter(k => k.includes('food'));
console.log(' ', foodKeys.join(', '));

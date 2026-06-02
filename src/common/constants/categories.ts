/**
 * Allowed category values that match frontend onboarding options
 * Used for validation when users save preferred categories
 */
export const ALLOWED_CATEGORIES = [
  'Food & Restaurants',
  'Home Services',
  'Beauty & Wellness',
  'Healthcare & Medical',
  'Hotels & Accommodation',
  'Shopping & Retail',
  'Education & Training',
  'Real Estate',
  'Events & Entertainment',
  'Professional Services',
  'Automotive Services',
  'Home Improvement',
  'Fitness & Sports',
  'Daily Needs & Utilities',
  'Local Businesses & Vendors',
] as const;

export type AllowedCategory = typeof ALLOWED_CATEGORIES[number];

const LEGACY_CATEGORY_ALIASES: Record<string, AllowedCategory> = {
  'Food & Dining': 'Food & Restaurants',
  Beauty: 'Beauty & Wellness',
  Healthcare: 'Healthcare & Medical',
};

function toCanonicalCategory(category: any): string {
  if (typeof category !== 'string') return '';
  const trimmed = category.trim();
  return LEGACY_CATEGORY_ALIASES[trimmed] || trimmed;
}

/**
 * Validates if a category is in the allowed list
 */
export function isValidCategory(category: any): category is AllowedCategory {
  const canonical = toCanonicalCategory(category);
  return ALLOWED_CATEGORIES.includes(canonical as AllowedCategory);
}

/**
 * Validates an array of categories
 * - Must be array
 * - Max 6 items
 * - All items must be valid categories
 * - No duplicates
 */
export function validatePreferredCategories(categories: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(categories)) {
    errors.push('preferredCategories must be an array');
    return { valid: false, errors };
  }

  if (categories.length === 0) {
    errors.push('At least 1 category must be selected');
  }

  if (categories.length > 6) {
    errors.push('Maximum 6 categories allowed');
  }

  const seen = new Set<string>();
  for (const cat of categories) {
    const canonical = toCanonicalCategory(cat);
    if (typeof cat !== 'string') {
      errors.push(`Category must be string, got ${typeof cat}`);
    } else if (!isValidCategory(canonical)) {
      errors.push(`Invalid category: "${cat}"`);
    } else if (seen.has(canonical)) {
      errors.push(`Duplicate category: "${cat}"`);
    }
    if (canonical) seen.add(canonical);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Deduplicate and normalize categories
 */
export function normalizeCategories(categories: any[]): AllowedCategory[] {
  if (!Array.isArray(categories)) return [];
  const canonical = categories.map((cat) => toCanonicalCategory(cat));
  return [...new Set(canonical.filter((cat): cat is AllowedCategory => isValidCategory(cat)))];
}

/**
 * Multi-lingual Transliteration (Roman Marathi / Hindi / English),
 * Spelling/Typo Correction, and Brand-Generic Synonyms Dictionary.
 */

// 1. Roman Marathi / Hindi to English Transliteration & Equivalents
export const TRANSLITERATION_MAP: Record<string, string[]> = {
  // Dairy & Grocery
  dudh: ['milk', 'dairy'],
  dud: ['milk', 'dairy'],
  doodh: ['milk', 'dairy'],
  panir: ['paneer', 'cottage cheese'],
  panner: ['paneer'],
  kanda: ['onion', 'onions'],
  pyaz: ['onion', 'onions'],
  pyaaz: ['onion', 'onions'],
  batata: ['potato', 'potatoes', 'aloo'],
  alu: ['potato', 'potatoes'],
  aloo: ['potato', 'potatoes'],
  tamatar: ['tomato', 'tomatoes'],
  tomato: ['tamatar'],
  sakhar: ['sugar', 'mithai'],
  shakar: ['sugar'],
  cheeni: ['sugar'],
  tel: ['oil', 'cooking oil'],
  tail: ['oil'],
  tandul: ['rice', 'chawal'],
  chawal: ['rice', 'tandul'],
  bhat: ['rice'],
  gahu: ['wheat', 'gehu', 'atta'],
  gehu: ['wheat', 'atta'],
  atta: ['flour', 'wheat flour'],
  chaha: ['tea', 'chai'],
  chai: ['tea', 'chaha'],
  kapi: ['coffee'],
  dahi: ['curd', 'yogurt'],
  tup: ['ghee', 'clarified butter'],
  toop: ['ghee'],
  mith: ['salt', 'namak'],
  namak: ['salt'],
  masala: ['spices', 'masale'],
  mirchi: ['chilli', 'pepper'],
  lasun: ['garlic'],
  lehsun: ['garlic'],
  ale: ['ginger', 'adrak'],
  adrak: ['ginger'],

  // Snacks & Bakery
  pav: ['bread', 'bun'],
  paav: ['bread', 'bun'],
  biskit: ['biscuit', 'biscuits', 'cookies'],
  biscut: ['biscuit', 'biscuits'],
  nasta: ['breakfast', 'snacks'],
  nashta: ['breakfast', 'snacks'],

  // Fruits
  keli: ['banana', 'bananas'],
  kela: ['banana', 'bananas'],
  safarchand: ['apple', 'apples'],
  seb: ['apple', 'apples'],
  amba: ['mango', 'mangoes'],
  aam: ['mango', 'mangoes'],
  draksh: ['grapes'],
  angur: ['grapes'],
  santara: ['orange', 'oranges'],
  mosambi: ['sweet lime'],

  // Clothing & Daily Wear
  sadhi: ['saree', 'sari'],
  sadi: ['saree', 'sari'],
  lugadi: ['saree'],
  chappal: ['slippers', 'sandals', 'footwear'],
  joda: ['shoes', 'footwear'],
  kapde: ['clothes', 'clothing', 'apparel'],
  vastra: ['clothes', 'clothing'],
  dhoti: ['dhoti', 'traditional wear'],
  kurti: ['kurta', 'tunic', 'ethnic wear'],
  kamiz: ['shirt', 'kurta'],

  // Cleaning & Personal Care
  sabun: ['soap', 'bathing soap'],
  saabun: ['soap'],
  farshee: ['floor cleaner'],
  bhande: ['dishwash', 'utensil cleaner'],

  // Health & Medicine
  aushadh: ['medicine', 'pharmacy', 'medicines'],
  dawa: ['medicine', 'pharmacy', 'medicines'],
  davakhana: ['clinic', 'doctor', 'hospital'],
  chashma: ['spectacles', 'glasses', 'eyewear'],

  // Services & Home
  ghar: ['home', 'house'],
  gaadi: ['car', 'vehicle', 'automobile'],
  durusti: ['repair', 'service'],
  swachhata: ['cleaning', 'pest control'],
  saloon: ['salon', 'haircut', 'barber'],
  barber: ['salon', 'haircut'],
};

// 2. Common Typos and Misspellings
export const TYPO_CORRECTIONS: Record<string, string> = {
  panner: 'paneer',
  paner: 'paneer',
  pneer: 'paneer',
  choclate: 'chocolate',
  choclatee: 'chocolate',
  choclat: 'chocolate',
  biscut: 'biscuit',
  biscit: 'biscuit',
  biskit: 'biscuit',
  biscuts: 'biscuits',
  magi: 'maggi',
  maggie: 'maggi',
  noddles: 'noodles',
  noodels: 'noodles',
  shampooo: 'shampoo',
  shampuu: 'shampoo',
  shapoo: 'shampoo',
  toothpast: 'toothpaste',
  tothpaste: 'toothpaste',
  biryani: 'biryani',
  biriyani: 'biryani',
  briyani: 'biryani',
  icecream: 'ice cream',
  icecreme: 'ice cream',
  headphon: 'headphones',
  hedphone: 'headphones',
  sneker: 'sneakers',
  snekar: 'sneakers',
  sandle: 'sandals',
  sandels: 'sandals',
  jewlery: 'jewellery',
  jewellry: 'jewellery',
  jewelery: 'jewellery',
  electornics: 'electronics',
  grocerry: 'grocery',
  grosery: 'grocery',
  vegitables: 'vegetables',
  vegitable: 'vegetables',
  vegtable: 'vegetables',
  restorant: 'restaurant',
  restarant: 'restaurant',
  restuarant: 'restaurant',
  saloon: 'salon',
  salun: 'salon',
  massag: 'massage',
  massaje: 'massage',
};

// 3. Brand & Generic Synonyms (Bidirectional mapping)
export const SYNONYMS_MAP: Record<string, string[]> = {
  // Dairy & Grocery
  'amul butter': ['butter', 'amul'],
  butter: ['amul butter', 'white butter', 'makhan'],
  makhan: ['butter', 'ghee'],
  'amul milk': ['milk', 'dudh'],
  milk: ['amul milk', 'dudh', 'dairy'],
  paneer: ['panir', 'panner', 'cottage cheese'],
  'cottage cheese': ['paneer'],
  ghee: ['tup', 'clarified butter'],
  curd: ['dahi', 'yogurt'],
  yogurt: ['curd', 'dahi'],

  // Noodles & Snacks
  maggi: ['noodles', 'instant noodles'],
  noodles: ['maggi', 'ramen', 'instant noodles'],
  chips: ['wafers', 'lays', 'potato chips', 'snacks'],
  lays: ['chips', 'potato chips', 'wafers'],
  wafers: ['chips', 'banana chips'],
  biscuit: ['cookies', 'parle g', 'good day', 'rusk'],
  cookies: ['biscuits', 'cookies', 'bakery'],

  // Beverages
  'cold drink': ['coke', 'pepsi', 'soft drink', 'soda'],
  'soft drink': ['cold drink', 'coke', 'pepsi', 'sprite', 'thumbs up'],
  coke: ['coca cola', 'cold drink', 'soft drink'],
  pepsi: ['cold drink', 'soft drink'],
  coffee: ['nescafe', 'bru', 'cold coffee'],
  tea: ['chai', 'chaha', 'green tea', 'taj mahal'],

  // Personal Care & Daily Needs
  colgate: ['toothpaste', 'oral care', 'paste'],
  toothpaste: ['colgate', 'pepsodent', 'dant kanti', 'sensodyne'],
  'surf excel': ['detergent', 'washing powder', 'detergent powder'],
  ariel: ['detergent', 'washing powder'],
  detergent: ['washing powder', 'surf excel', 'ariel', 'tide', 'surf'],
  soap: ['bath soap', 'dettol', 'dove', 'lifebuoy', 'lux', 'sabun'],
  shampoo: ['hair wash', 'dove', 'head and shoulders', 'clinic plus'],

  // Fashion & Apparel
  kurti: ['kurta', 'tunic', 'ethnic set', 'suit'],
  kurta: ['kurti', 'men kurta', 'ethnic wear'],
  saree: ['sari', 'paithani', 'silk saree', 'cotton saree'],
  jeans: ['denim', 'trousers', 'pants'],
  tshirt: ['t-shirt', 'tee', 'polo', 'top'],
  shoes: ['footwear', 'sneakers', 'sports shoes', 'formal shoes'],
  sneakers: ['shoes', 'sports shoes', 'casual shoes'],
  slippers: ['chappal', 'flip flops', 'sandals'],

  // Food & Dining
  pizza: ['italian', 'cheese pizza', 'garlic bread'],
  burger: ['fast food', 'patty burger', 'fries'],
  biryani: ['hyderabadi biryani', 'dum biryani', 'chicken biryani'],
  thali: ['maharashtrian thali', 'punjabi thali', 'meals', 'lunch'],
};

// 4. Token Category Inferrer (Platform Standard Categories)
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Restaurants': [
    'pizza', 'burger', 'biryani', 'thali', 'restaurant', 'cafe', 'hotel',
    'fast food', 'chinese', 'dosa', 'roll', 'misal', 'pav bhaji', 'momos',
    'cake', 'pastry', 'bakery', 'sweets', 'mithai', 'lunch', 'dinner',
    'coffee', 'tea', 'ice cream', 'shakes', 'milkshake', 'bar', 'pub',
  ],
  'Daily Needs & Utilities': [
    'milk', 'dudh', 'paneer', 'butter', 'curd', 'dahi', 'ghee', 'oil',
    'rice', 'wheat', 'atta', 'sugar', 'salt', 'chai', 'grocery', 'kirana',
    'biscuit', 'maggi', 'noodles', 'chips', 'onion', 'kanda', 'potato', 'batata', 'tomato',
    'fruits', 'vegetables', 'soap', 'detergent', 'toothpaste', 'shampoo',
    'daily needs', 'utilities', 'recharge', 'ration',
  ],
  'Shopping & Retail': [
    'saree', 'sadhi', 'kurti', 'kurta', 'jeans', 'shirt', 'tshirt',
    'dress', 'ethnic', 'lehenga', 'suit', 'jacket', 'shoes', 'sneakers',
    'slippers', 'chappal', 'sandals', 'footwear', 'watch', 'jewellery',
    'clothes', 'clothing', 'fashion', 'mall', 'store', 'shop', 'bags', 'luggage',
    'phone', 'mobile', 'laptop', 'tv', 'electronics', 'earphones', 'headphones',
  ],
  'Beauty & Wellness': [
    'salon', 'haircut', 'facial', 'spa', 'massage', 'parlour', 'waxing',
    'manicure', 'pedicure', 'makeup', 'skincare', 'hair spa', 'beard',
    'wellness', 'beauty parlour', 'ayurvedic spa',
  ],
  'Healthcare & Medical': [
    'medicine', 'pharmacy', 'chemist', 'doctor', 'clinic', 'dentist',
    'hospital', 'ayurveda', 'homeopathy', 'chashma', 'spectacles',
    'medical', 'health', 'pathology', 'lab', 'diagnostic',
  ],
  'Hotels & Accommodation': [
    'hotel', 'lodge', 'resort', 'stay', 'rooms', 'pg', 'hostel',
    'homestay', 'guest house', 'accommodation', 'suite',
  ],
  'Home Services': [
    'cleaning', 'plumber', 'electrician', 'carpenter', 'pest control',
    'appliance repair', 'washing machine repair', 'ac repair', 'sofa cleaning',
    'water purifier', 'house cleaning', 'maid service',
  ],
  'Automotive Services': [
    'car repair', 'bike repair', 'mechanic', 'car wash', 'tyre', 'garage',
    'puncture', 'wheel alignment', 'servicing', 'auto parts', 'car accessories',
  ],
  'Fitness & Sports': [
    'gym', 'fitness', 'crossfit', 'workout', 'yoga', 'zumba', 'trainer',
    'sports', 'cricket', 'badminton', 'football', 'swimming', 'nutrition',
  ],
  'Events & Entertainment': [
    'events', 'party', 'cinema', 'movie', 'dj', 'photographer', 'catering',
    'banquet', 'hall', 'wedding', 'decoration', 'entertainment',
  ],
  'Home Improvement': [
    'interior', 'paint', 'tiles', 'hardware', 'furniture', 'renovation',
    'modular kitchen', 'wallpaper', 'plywood', 'lighting',
  ],
  'Education & Training': [
    'classes', 'coaching', 'tuition', 'school', 'college', 'training',
    'academy', 'institute', 'spoken english', 'dance class', 'music class',
  ],
  'Real Estate': [
    'property', 'flat', 'apartment', 'plot', 'rent', 'commercial',
    'broker', 'real estate', 'builder', 'office space',
  ],
  'Professional Services': [
    'ca', 'advocate', 'lawyer', 'tax', 'accounting', 'notary',
    'consultant', 'printing', 'xerox', 'courier', 'insurance',
  ],
  'Local Businesses & Vendors': [
    'vendor', 'local business', 'wholesale', 'distributor', 'trader',
    'supplier', 'dealer', 'agencies', 'crafts', 'market',
  ],
};

/**
 * Expand a user search query into normalized tokens and potential equivalents.
 */
export function expandQuery(rawQuery: string): {
  normalized: string;
  corrected: string;
  isCorrected: boolean;
  equivalents: string[];
} {
  const clean = (rawQuery || '').trim().toLowerCase();
  if (!clean) {
    return { normalized: '', corrected: '', isCorrected: false, equivalents: [] };
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  const correctedTokens: string[] = [];
  let isCorrected = false;
  const expansionSet = new Set<string>();

  expansionSet.add(clean);

  // Check whole query in synonyms and transliterations
  if (SYNONYMS_MAP[clean]) {
    SYNONYMS_MAP[clean].forEach((s) => expansionSet.add(s.toLowerCase()));
  }
  if (TRANSLITERATION_MAP[clean]) {
    TRANSLITERATION_MAP[clean].forEach((s) => expansionSet.add(s.toLowerCase()));
  }

  // Token-by-token checks
  for (const token of tokens) {
    let corrected = token;

    // Check typos
    if (TYPO_CORRECTIONS[token]) {
      corrected = TYPO_CORRECTIONS[token];
      isCorrected = true;
    }

    correctedTokens.push(corrected);
    expansionSet.add(corrected);

    // Add transliteration equivalents
    if (TRANSLITERATION_MAP[token]) {
      TRANSLITERATION_MAP[token].forEach((s) => expansionSet.add(s.toLowerCase()));
    }
    if (TRANSLITERATION_MAP[corrected]) {
      TRANSLITERATION_MAP[corrected].forEach((s) => expansionSet.add(s.toLowerCase()));
    }

    // Add synonym equivalents
    if (SYNONYMS_MAP[token]) {
      SYNONYMS_MAP[token].forEach((s) => expansionSet.add(s.toLowerCase()));
    }
    if (SYNONYMS_MAP[corrected]) {
      SYNONYMS_MAP[corrected].forEach((s) => expansionSet.add(s.toLowerCase()));
    }
  }

  const correctedPhrase = correctedTokens.join(' ');
  if (correctedPhrase !== clean) {
    isCorrected = true;
    expansionSet.add(correctedPhrase);
  }

  return {
    normalized: clean,
    corrected: correctedPhrase,
    isCorrected,
    equivalents: Array.from(expansionSet),
  };
}

/**
 * Stop words or secondary qualifiers to strip when dropping to partial match.
 */
const DESCRIPTORS_AND_STOP_WORDS = new Set([
  'best', 'top', 'cheap', 'fresh', 'hot', 'pure', 'new', 'red', 'blue',
  'green', 'black', 'white', 'yellow', 'cotton', 'silk', 'large', 'small',
  'organic', 'original', 'special', 'online', 'near', 'me', 'in', 'at', 'for',
  'and', 'with', 'the', 'a', 'an'
]);

/**
 * Generate partial query variants when a multi-word search yields 0 results.
 * e.g., "red cotton kurti" -> ["cotton kurti", "kurti"]
 */
export function getPartialQueryVariants(rawQuery: string): string[] {
  const clean = (rawQuery || '').trim().toLowerCase();
  const tokens = clean.split(/\s+/).filter(Boolean);

  if (tokens.length <= 1) {
    return [];
  }

  const variants: string[] = [];

  // 1. Remove recognized stop words / descriptors first
  const meaningfulTokens = tokens.filter((t) => !DESCRIPTORS_AND_STOP_WORDS.has(t));
  if (meaningfulTokens.length > 0 && meaningfulTokens.length < tokens.length) {
    variants.push(meaningfulTokens.join(' '));
  }

  // 2. Remove first token (often adjective or descriptor e.g. "red cotton kurti" -> "cotton kurti")
  if (tokens.length >= 2) {
    variants.push(tokens.slice(1).join(' '));
  }

  // 3. Keep last token (in English and Indian languages, last token is usually the primary noun e.g. "kurti", "pizza", "shoes")
  const lastToken = tokens[tokens.length - 1];
  if (!variants.includes(lastToken) && lastToken.length > 2) {
    variants.push(lastToken);
  }

  // 4. Meaningful individual tokens
  for (const t of meaningfulTokens) {
    if (!variants.includes(t) && t.length > 2) {
      variants.push(t);
    }
  }

  return Array.from(new Set(variants)).filter((v) => v !== clean);
}

/**
 * Infer primary category from query tokens to suggest related items if 0 results match.
 */
export function inferCategory(rawQuery: string): string | null {
  const clean = (rawQuery || '').trim().toLowerCase();
  const tokens = clean.split(/\s+/).filter(Boolean);

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (clean.includes(kw)) {
        return category;
      }
      for (const token of tokens) {
        if (token === kw || TYPO_CORRECTIONS[token] === kw) {
          return category;
        }
      }
    }
  }

  return null;
}

/**
 * Generate algorithmic 1-edit distance variants for ANY word:
 * 1. Single character deletions (handles extra letters e.g. "pickale" -> "pickle", "appple" -> "apple")
 * 2. Transposition of adjacent letters (handles typo swaps e.g. "pikcle" -> "pickle", "shrit" -> "shirt")
 * 3. Collapsing repeated double/triple letters (e.g. "pickkkle" -> "pickle", "sweeet" -> "sweet")
 * 4. Common Indian Roman English phonetic substitutions (ph/f, ck/k, ee/i, oo/u, dh/d, etc.)
 */
export function getAlgorithmicEdits(word: string): string[] {
  const clean = word.toLowerCase().trim();
  if (clean.length < 3) return [clean];

  const variants = new Set<string>();

  // 1. Single character deletions (very common typo: extra letter typed like 'pickale')
  for (let i = 0; i < clean.length; i++) {
    const deleted = clean.slice(0, i) + clean.slice(i + 1);
    if (deleted.length >= 3) {
      variants.add(deleted);
    }
  }

  // 2. Transpositions of adjacent characters (e.g. 'pikcle' -> 'pickle')
  for (let i = 0; i < clean.length - 1; i++) {
    const transposed = clean.slice(0, i) + clean[i + 1] + clean[i] + clean.slice(i + 2);
    variants.add(transposed);
  }

  // 3. Collapse repeated letters (e.g. "pp" -> "p", "ll" -> "l", "kk" -> "k")
  const collapsed = clean.replace(/(.)\1+/g, '$1');
  if (collapsed !== clean && collapsed.length >= 3) {
    variants.add(collapsed);
  }

  // 4. Character duplication for missing double letters (e.g. "aple" -> "apple", "piza" -> "pizza")
  for (let i = 0; i < clean.length; i++) {
    variants.add(clean.slice(0, i + 1) + clean[i] + clean.slice(i + 1));
  }

  // 5. Single vowel insertions for omitted vowels (e.g. "pckle" -> "pickle", "chclate" -> "chocolate")
  if (clean.length >= 3 && clean.length <= 10) {
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    for (let i = 1; i < clean.length; i++) {
      for (const v of vowels) {
        variants.add(clean.slice(0, i) + v + clean.slice(i));
      }
    }
  }

  // 6. Common Indian Roman English phonetic substitutions
  const phoneticVariants = [
    clean.replace(/ph/g, 'f'),
    clean.replace(/f/g, 'ph'),
    clean.replace(/ck/g, 'k'),
    clean.replace(/k/g, 'ck'),
    clean.replace(/ee/g, 'i'),
    clean.replace(/i/g, 'ee'),
    clean.replace(/oo/g, 'u'),
    clean.replace(/u/g, 'oo'),
    clean.replace(/dh/g, 'd'),
    clean.replace(/th/g, 't'),
    clean.replace(/bh/g, 'b'),
    clean.replace(/w/g, 'v'),
    clean.replace(/v/g, 'w'),
    clean.replace(/sh/g, 's'),
    clean.replace(/s/g, 'sh'),
  ];
  phoneticVariants.forEach((v) => {
    if (v !== clean && v.length >= 3) variants.add(v);
  });

  return Array.from(variants);
}

/**
 * Build a flexible algorithmic fuzzy regex for ANY word.
 * Tolerates:
 * - Vowel flexibility: vowels (a, e, i, o, u) are treated as fluid [aeiou]*
 * - Consonants with optional aspirates: d -> d[h]?, t -> t[h]?, b -> b[h]?, s -> s[h]?
 * - Gutturals: c/k/ck -> (?:ck|[ck])
 * - Bilabials: v/w -> [vw]
 * - Labiodentals: f/ph -> (?:ph|[fp])
 */
export function buildFuzzyPhoneticRegex(word: string): RegExp | null {
  const clean = word.toLowerCase().trim();
  if (clean.length < 3) return null;

  let pattern = '';
  let i = 0;

  while (i < clean.length) {
    const ch = clean[i];
    const next = clean[i + 1] || '';

    // Check 2-letter combos
    if (ch === 'c' && next === 'k') {
      pattern += '(?:ck|[ck])';
      i += 2;
    } else if (ch === 'p' && next === 'h') {
      pattern += '(?:ph|[fp])';
      i += 2;
    } else if (ch === 's' && next === 'h') {
      pattern += '(?:sh|s)';
      i += 2;
    } else if (ch === 'c' && next === 'h') {
      pattern += '(?:chh|ch|c)';
      i += 2;
    } else if ((ch === 'd' || ch === 't' || ch === 'b' || ch === 'g' || ch === 'k') && next === 'h') {
      pattern += `${ch}h?`;
      i += 2;
    } else if (/[aeiou]/.test(ch)) {
      // Vowel group: skip consecutive vowels and allow 0 or more vowels
      let vCount = 1;
      while (i + vCount < clean.length && /[aeiou]/.test(clean[i + vCount])) {
        vCount++;
      }
      pattern += '[aeiou]*';
      i += vCount;
    } else if (ch === 'c' || ch === 'k' || ch === 'q') {
      pattern += '(?:ck|[ckq])';
      i++;
    } else if (ch === 'v' || ch === 'w') {
      pattern += '[vw]';
      i++;
    } else if (ch === 'f') {
      pattern += '(?:ph|f)';
      i++;
    } else if (ch === 's') {
      pattern += '(?:sh|s)';
      i++;
    } else if (ch === 'd' || ch === 't' || ch === 'b' || ch === 'g') {
      pattern += `${ch}h?`;
      i++;
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  if (!pattern || pattern.length < 2) return null;

  try {
    return new RegExp(`\\b${pattern}`, 'i');
  } catch {
    return null;
  }
}

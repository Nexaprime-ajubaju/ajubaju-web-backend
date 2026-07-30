const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const LOCAL_URI = 'mongodb://localhost:27017/golo';

const CATEGORIES = [
  'Food & Dining',
  'Electronics',
  'Fashion & Apparel',
  'Fitness & Gym',
  'Beauty & Spa',
  'Real Estate',
  'Education & Learning',
  'Automotive & Spares',
  'Home & Furniture',
  'Jewelry & Luxury',
];

const PLANS = ['premium', 'pro', 'starter'];

// Dynamic palette for visually striking banner mockups
const TIER_COLORS = {
  premium: { bg: '1e1b4b', text: 'f59e0b' }, // Deep Indigo with Amber Gold text
  pro: { bg: '0f172a', text: '38bdf8' },     // Slate Blue with Light Blue text
  starter: { bg: '064e3b', text: '34d399' }, // Dark Emerald with Emerald Green text
};

async function seed300UniqueBanners() {
  console.log('Connecting to Local MongoDB:', LOCAL_URI);
  await mongoose.connect(LOCAL_URI);

  const db = mongoose.connection.db;

  console.log('Clearing existing banner promotions and queue state in local database...');
  await db.collection('banner_promotions').deleteMany({});
  await db.collection('banner_city_queues').deleteMany({});
  await db.collection('banner_scheduler_states').deleteMany({});

  console.log('Generating 300 active banners with 300 UNIQUE images and distinct visual identifiers...');

  const banners = [];
  const now = new Date();
  const startDate = new Date('2026-07-01');
  const endDate = new Date('2026-12-31');

  for (let i = 1; i <= 300; i++) {
    const tier = PLANS[(i - 1) % 3]; // Cycles premium, pro, starter
    const category = CATEGORIES[i % CATEGORIES.length];
    const merchantNum = (i % 50) + 1; // 50 distinct merchants
    const colors = TIER_COLORS[tier];

    // Unique Picsum photography image URL with distinct seed for each banner
    const imageUrl = `https://picsum.photos/seed/golo_banner_unique_${i}/1200/500`;

    banners.push({
      requestId: randomUUID(),
      merchantId: `merchant_test_id_${merchantNum}`,
      merchantName: `Store #${merchantNum} (${tier.toUpperCase()})`,
      merchantEmail: `merchant${merchantNum}@golo.com`,
      bannerTitle: `[#${i} ${tier.toUpperCase()}] ${category} Special Offer`,
      bannerCategory: category,
      description: `Exclusive promotion for banner #${i} (${tier.toUpperCase()}) in Kolhapur`,
      promotionType: 'banner',
      imageUrl: imageUrl,
      recommendedSize: '1920 x 520 px',
      selectedDates: [startDate, endDate],
      startDate: startDate,
      endDate: endDate,
      selectedDays: 180,
      dailyRate: tier === 'premium' ? 500 : tier === 'pro' ? 300 : 150,
      platformFee: 49,
      totalPrice: tier === 'premium' ? 90000 : tier === 'pro' ? 54000 : 27000,
      subscriptionPlan: tier,
      targetCities: ['Kolhapur'],
      status: 'active',
      paymentStatus: 'paid',
      isHomepageVisible: true,
      paidAt: new Date(now.getTime() - i * 60000),
      createdAt: new Date(now.getTime() - i * 120000),
      updatedAt: now,
    });
  }

  await db.collection('banner_promotions').insertMany(banners);
  console.log(`✅ Inserted ${banners.length} active banners with 300 UNIQUE image URLs into local MongoDB!`);

  await mongoose.disconnect();
  console.log('Done!');
  process.exit(0);
}

seed300UniqueBanners().catch((err) => {
  console.error('Error seeding 300 unique banners:', err);
  process.exit(1);
});

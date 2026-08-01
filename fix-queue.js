const mongoose = require('mongoose');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const banners = JSON.parse(fs.readFileSync('banners.json', 'utf8'));
const city = 'global';
const now = new Date();

const eligible = banners.filter((campaign) => {
  if (!campaign) return false;
  const validStatuses = ['approved', 'active'];
  if (!validStatuses.includes(campaign.status)) return false;
  if (campaign.promotionType && campaign.promotionType !== 'banner') return false;
  if (campaign.isHomepageVisible === false) return false;
  
  if (campaign.endDate) {
    const end = new Date(campaign.endDate);
    if (!isNaN(end.getTime()) && end < now) {
      if (campaign.status !== 'active') return false;
    }
  }
  
  if (campaign.targetCities && campaign.targetCities.length > 0 && city && city.toLowerCase() !== 'global') {
    const cityLower = city.trim().toLowerCase();
    const matchesCity = campaign.targetCities.some(
      (tc) => String(tc).trim().toLowerCase() === cityLower,
    );
    if (!matchesCity) return false;
  }
  return true;
});

eligible.sort((a, b) => {
  const tierA = (a.subscriptionPlan || 'starter').toLowerCase();
  const tierB = (b.subscriptionPlan || 'starter').toLowerCase();
  const TIER_WEIGHTS = { premium: 3, pro: 2, starter: 1 };
  const weightA = TIER_WEIGHTS[tierA] || 1;
  const weightB = TIER_WEIGHTS[tierB] || 1;
  if (weightA !== weightB) return weightB - weightA;
  const paidA = a.paidAt ? new Date(a.paidAt).getTime() : 0;
  const paidB = b.paidAt ? new Date(b.paidAt).getTime() : 0;
  if (paidA !== paidB) return paidB - paidA;
  const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return createdB - createdA;
});

const queueRequestIds = eligible.map(c => c.requestId).slice(0, 200);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo', {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 120000
    });
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    
    await db.collection('banner_city_queues').updateOne(
      { city: 'global' },
      {
        $set: {
          queue: queueRequestIds,
          version: 2,
          activeVersion: 2,
          pendingVersion: 2,
          totalCampaigns: queueRequestIds.length,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    console.log('Successfully saved queue with', queueRequestIds.length, 'banners!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();

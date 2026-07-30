const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    
    const db = mongoose.connection.db;
    const allCandidates = await db.collection('banner_promotions').find({
      status: { $in: ['approved', 'active'] },
      isHomepageVisible: true,
    }).toArray();
    
    console.log('Candidates found:', allCandidates.length);
    
    const city = 'global';
    const now = new Date();
    
    const eligible = allCandidates.filter((campaign) => {
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
    
    console.log('Eligible:', eligible.length);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

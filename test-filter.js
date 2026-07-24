const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { Schema } = mongoose;
const BannerPromotionSchema = new Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  merchantId: { type: String, required: true, index: true },
  status: { type: String, required: true },
  isHomepageVisible: { type: Boolean },
  promotionType: { type: String },
  endDate: { type: Date },
  targetCities: { type: [String] }
}, { timestamps: true, collection: 'banner_promotions', autoIndex: false });

const BannerPromotion = mongoose.model('BannerPromotion3', BannerPromotionSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    
    const allCandidates = await BannerPromotion.find({
      status: { $in: ['approved', 'active'] },
      isHomepageVisible: true,
    }).lean().exec();
    
    console.log('Candidates found:', allCandidates.length);
    
    const city = 'global';
    const now = new Date();
    
    const eligible = allCandidates.filter((campaign) => {
      if (!campaign) {
        console.log('Failed: !campaign');
        return false;
      }
      const validStatuses = ['approved', 'active'];
      if (!validStatuses.includes(campaign.status)) {
        console.log('Failed: status');
        return false;
      }
      if (campaign.promotionType && campaign.promotionType !== 'banner') {
        console.log('Failed: promotionType', campaign.promotionType);
        return false;
      }
      if (campaign.isHomepageVisible === false) {
        console.log('Failed: isHomepageVisible false');
        return false;
      }
      
      if (campaign.endDate) {
        const end = new Date(campaign.endDate);
        if (!isNaN(end.getTime()) && end < now) {
          if (campaign.status !== 'active') {
             console.log('Failed: endDate in past and not active');
             return false;
          }
        }
      }
      
      if (campaign.targetCities && campaign.targetCities.length > 0 && city && city.toLowerCase() !== 'global') {
        const cityLower = city.trim().toLowerCase();
        const matchesCity = campaign.targetCities.some(
          (tc) => String(tc).trim().toLowerCase() === cityLower,
        );
        if (!matchesCity) {
           console.log('Failed: targetCities mismatch');
           return false;
        }
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

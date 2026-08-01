const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { Schema } = mongoose;
const BannerPromotionSchema = new Schema({}, { strict: false, collection: 'banner_promotions' });
const BannerPromotion = mongoose.model('BannerPromotionProj', BannerPromotionSchema);

async function run() {
  const start = Date.now();
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to DB in', Date.now() - start, 'ms');
    
    const queryStart = Date.now();
    const allCandidates = await BannerPromotion.find({
      status: { $in: ['approved', 'active'] },
    }).select('requestId status isHomepageVisible promotionType endDate targetCities subscriptionPlan paidAt createdAt').lean().exec();
    
    console.log('Query finished in', Date.now() - queryStart, 'ms. Found:', allCandidates.length);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

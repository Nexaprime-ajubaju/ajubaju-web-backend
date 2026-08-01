const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { Schema } = mongoose;

const BannerPromotionSchema = new Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  merchantId: { type: String, required: true, index: true },
  status: { type: String, required: true }
}, { timestamps: true, collection: 'banner_promotions', autoIndex: false });

const BannerPromotion = mongoose.model('BannerPromotion2', BannerPromotionSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    
    console.log('Running query with autoIndex: false...');
    const allCandidates = await BannerPromotion.find({
      status: { $in: ['approved', 'active'] },
      isHomepageVisible: true,
    }).lean().exec();
    
    console.log('Query finished. Found:', allCandidates.length);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { Schema } = mongoose;
const BannerPromotionSchema = new Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  merchantId: { type: String, required: true, index: true },
  status: { type: String, required: true },
  isHomepageVisible: { type: Boolean }
}, { timestamps: true, collection: 'banner_promotions', autoIndex: false });

const BannerPromotion = mongoose.model('BannerPromotion4', BannerPromotionSchema);

async function run() {
  const start = Date.now();
  try {
    await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
    console.log('Connected to DB in', Date.now() - start, 'ms');
    
    const queryStart = Date.now();
    const allCandidates = await BannerPromotion.find({
      status: { $in: ['approved', 'active'] },
    }).lean().exec();
    
    console.log('Query finished in', Date.now() - queryStart, 'ms. Found:', allCandidates.length);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

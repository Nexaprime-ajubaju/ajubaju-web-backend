const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { Schema } = mongoose;
const BannerPromotionSchema = new Schema({}, { strict: false, collection: 'banner_promotions' });
const BannerPromotion = mongoose.model('BannerPromotion', BannerPromotionSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to DB. Starting migration...');
    
    // Find all banners with Base64 strings (starting with 'data:image')
    const corruptedBanners = await BannerPromotion.find({
      imageUrl: { $regex: '^data:image' }
    }).select('_id merchantId bannerTitle').exec();
    
    if (corruptedBanners.length === 0) {
      console.log('No corrupted Base64 banners found!');
    } else {
      console.log(`Found ${corruptedBanners.length} corrupted banners. Deleting them...`);
      
      const idsToDelete = corruptedBanners.map(b => b._id);
      
      const result = await BannerPromotion.deleteMany({
        _id: { $in: idsToDelete }
      });
      
      console.log(`Successfully deleted ${result.deletedCount} corrupted banners.`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();

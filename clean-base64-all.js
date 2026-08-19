const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to DB. Cleaning up Base64 strings...');
    
    const Offer = mongoose.model('Offer', new mongoose.Schema({}, { strict: false }), 'offers');
    const Merchant = mongoose.model('Merchant', new mongoose.Schema({}, { strict: false }), 'merchants');
    
    console.log('Finding offers with base64 imageUrl...');
    let result = await Offer.updateMany(
      { imageUrl: { $regex: '^data:image' } },
      { $set: { imageUrl: 'https://via.placeholder.com/150' } }
    );
    console.log(`Updated ${result.modifiedCount} offers.`);
    
    console.log('Finding merchants with base64 profilePhoto...');
    result = await Merchant.updateMany(
      { profilePhoto: { $regex: '^data:image' } },
      { $set: { profilePhoto: 'https://via.placeholder.com/150' } }
    );
    console.log(`Updated ${result.modifiedCount} merchant profile photos.`);

    console.log('Finding merchants with base64 shopPhoto...');
    result = await Merchant.updateMany(
      { shopPhoto: { $regex: '^data:image' } },
      { $set: { shopPhoto: 'https://via.placeholder.com/150' } }
    );
    console.log(`Updated ${result.modifiedCount} merchant shop photos.`);
    
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();

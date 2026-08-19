const mongoose = require('mongoose');
require('dotenv').config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Offer = mongoose.model('Offer', new mongoose.Schema({}, { strict: false }), 'offers');
  console.log('Querying offers for long imageUrl...');
  const allOffers = await Offer.find({}).select('_id imageUrl videoUrl').lean().exec();
  const offers = allOffers.filter(o => (o.imageUrl && o.imageUrl.length > 500) || (o.videoUrl && o.videoUrl.length > 500));
  console.log('Offers with long imageUrl/videoUrl (>500 chars):', offers.length);
  if (offers.length > 0) {
    console.log('Sample lengths:', offers.slice(0,3).map(o => (o.imageUrl ? o.imageUrl.length : 0)));
    const ids = offers.map(o => o._id);
    const res = await Offer.updateMany({ _id: { $in: ids } }, { $set: { imageUrl: 'https://via.placeholder.com/150', videoUrl: null } });
    console.log('Updated', res.modifiedCount, 'offers');
  }
  process.exit(0);
}
run();

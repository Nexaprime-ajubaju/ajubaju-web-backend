const mongoose = require('mongoose');
require('dotenv').config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Offer = mongoose.model('Offer', new mongoose.Schema({}, { strict: false }), 'offers');
  console.log('Querying offers for huge selectedProducts...');
  const offers = await Offer.find({}).select('_id selectedProducts').lean().exec();
  
  let hugeCount = 0;
  for (const offer of offers) {
    if (offer.selectedProducts && Array.isArray(offer.selectedProducts)) {
      let changed = false;
      for (const prod of offer.selectedProducts) {
        if (prod.imageUrl && prod.imageUrl.length > 500) {
          prod.imageUrl = 'https://via.placeholder.com/150';
          changed = true;
        }
      }
      if (changed) {
        hugeCount++;
        await Offer.updateOne({ _id: offer._id }, { $set: { selectedProducts: offer.selectedProducts } });
      }
    }
  }
  
  console.log('Offers with huge selectedProducts updated:', hugeCount);
  process.exit(0);
}
run();

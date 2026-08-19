const mongoose = require('mongoose');
require('dotenv').config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Offer = mongoose.model('Offer', new mongoose.Schema({}, { strict: false }), 'offers');
  console.log('Querying all offers to find massive fields...');
  const offers = await Offer.find({}).lean().exec();
  
  let largestDoc = null;
  let maxSize = 0;
  let largestField = null;

  for (const offer of offers) {
    for (const key of Object.keys(offer)) {
      const size = JSON.stringify(offer[key]).length;
      if (size > maxSize) {
        maxSize = size;
        largestField = key;
        largestDoc = offer._id;
      }
    }
  }
  
  console.log('Largest Field:', largestField);
  console.log('Size:', maxSize, 'bytes');
  console.log('Document ID:', largestDoc);
  process.exit(0);
}
run();

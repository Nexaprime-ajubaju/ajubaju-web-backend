const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function imageStatusCorrelation() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const now = new Date();

    const offers = await db.collection('offers').find({
      status: { $in: ['under_review', 'approved', 'active'] },
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).toArray();

    console.log('📊 Total valid offers: ' + offers.length + '\n');

    // Show each offer's status and image presence
    console.log('Offer details:');
    offers.forEach((o, i) => {
      const hasImage = o.imageUrl && o.imageUrl.trim() !== '';
      console.log((i+1) + '. ' + o.title + ' | status: ' + o.status + ' | image: ' + (hasImage ? '✅' : '❌') + ' | category: "' + o.category + '"');
    });

    // Count active + image
    const activeWithImage = offers.filter(o => o.status === 'active' && o.imageUrl && o.imageUrl.trim() !== '').length;
    const activeWithoutImage = offers.filter(o => o.status === 'active' && (!o.imageUrl || o.imageUrl.trim() === '')).length;
    const underReviewWithImage = offers.filter(o => o.status === 'under_review' && o.imageUrl && o.imageUrl.trim() !== '').length;

    console.log('\n📈 Summary:');
    console.log('   Active offers: ' + offers.filter(o => o.status === 'active').length);
    console.log('   Active with image: ' + activeWithImage);
    console.log('   Active without image: ' + activeWithoutImage);
    console.log('   Under_review with image: ' + underReviewWithImage);

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
}

imageStatusCorrelation();

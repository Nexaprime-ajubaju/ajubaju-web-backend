const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  try {
    const res = await mongoose.connection.collection('offers').aggregate([
      { 
        $geoNear: { 
          near: { type: 'Point', coordinates: [74.2432531, 16.7049873] }, 
          distanceField: 'distanceMeters', 
          maxDistance: 50 * 1000, 
          spherical: true
        } 
      }
    ]).toArray();
    console.log('Length:', res.length);
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
});

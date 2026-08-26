require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  // Find the "Marvels" merchant
  const m = await mongoose.connection.collection('merchants').findOne({ storeName: 'Marvels' });
  if (m) {
    console.log('userId:', m.userId);
    console.log('storeName:', m.storeName);
    console.log('businessType:', m.businessType);
    console.log('yearsInBusiness:', m.yearsInBusiness);
    console.log('businessDescription:', m.businessDescription);
    console.log('documents:', JSON.stringify(m.documents, null, 2));
    
    // Now test the API
    const res = await fetch(`http://localhost:3002/users/${m.userId}`);
    const data = await res.json();
    console.log('\n=== API Response merchantProfile ===');
    const mp = data?.data?.merchantProfile;
    if (mp) {
      console.log('storeName:', mp.storeName);
      console.log('businessType:', mp.businessType);
      console.log('yearsInBusiness:', mp.yearsInBusiness);
      console.log('businessDescription:', mp.businessDescription);
      console.log('documents:', JSON.stringify(mp.documents, null, 2));
    } else {
      console.log('merchantProfile is NULL/undefined in API response!');
      console.log('Full response data:', JSON.stringify(data?.data, null, 2));
    }
  }
  process.exit(0);
}).catch(console.error);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/golo';

async function updateMerchantCategories() {
  try {
    await mongoose.connect(mongoUri);

    const db = mongoose.connection.db;

    console.log('=== UPDATING MERCHANT CATEGORIES ===\n');

    const updates = [
      {
        userId: '69e8a38005c4e35f48a16c0e', // Pizza Palace
        updates: { storeCategory: 'Food & Dining', storeSubCategory: 'Pizzas' }
      },
      {
        userId: '69e8a38005c4e35f48a16c0f', // Fashion Hub
        updates: { storeCategory: 'Shopping & Retail', storeSubCategory: 'Fashion' }
      },
      {
        userId: '69e8a38005c4e35f48a16c10', // Tech World
        updates: { storeCategory: 'Shopping & Retail', storeSubCategory: 'Electronics' }
      },
      {
        userId: '69e8a38005c4e35f48a16c12', // Salon Elegance
        updates: { storeCategory: 'Beauty & Wellness', storeSubCategory: 'Salon' }
      },
      {
        userId: '69e866b45cdb62520367ab36', // Blinkit
        updates: { storeCategory: 'Home Services', storeSubCategory: 'Home Delivery' }
      },
      {
        userId: '69e8a07683f10143e0bda646', // Zudio
        updates: { storeCategory: 'Hotels & Accommodation', storeSubCategory: 'Hotels' }
      },
      {
        userId: '69e89635a0a4d63633d987d2', // Swiggy
        updates: { storeCategory: 'Education & Training', storeSubCategory: 'Courses' }
      },
      {
        userId: '69faf1a54eb82f4371357231', // edzh
        updates: { storeCategory: 'Automotive Services', storeSubCategory: 'Car Service' }
      }
    ];

    for (const update of updates) {
      const result = await db.collection('merchants').updateOne(
        { userId: update.userId },
        { $set: update.updates }
      );
      
      if (result.matchedCount > 0) {
        console.log(`✓ Updated merchant ${update.userId}`);
        console.log(`  → ${update.updates.storeCategory}`);
      }
    }

    console.log('\n✅ All merchant categories updated!\n');

    // Show updated merchants
    console.log('=== UPDATED MERCHANTS ===\n');
    const merchants = await db.collection('merchants').find({}).toArray();
    merchants.forEach((m, i) => {
      console.log(`${i+1}. ${m.storeName}`);
      console.log(`   Category: ${m.storeCategory}`);
      console.log(`   SubCategory: ${m.storeSubCategory}`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

updateMerchantCategories();

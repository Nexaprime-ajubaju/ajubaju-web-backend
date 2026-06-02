// Test recommendations service by bootstrapping Nest app context
const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });

async function runTest() {
  // Connect to DB first
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('✅ MongoDB connected');

  const db = mongoose.connection.db;
  
  // Get test user
  const user = await db.collection('users').findOne({
    preferredCategories: { $exists: true, $ne: [] }
  });
  
  console.log(`👤 Test User: ${user.email}`);
  console.log(`   Categories: ${JSON.stringify(user.preferredCategories)}`);
  console.log(`   UserId: ${user._id}\n`);

  // Bootstrap Nest app (from compiled dist)
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('✅ Nest app context created\n');

  const recommendationsService = app.get('RecommendationsService');

  // Call getDebugInfo
  console.log('🔍 Calling getDebugInfo...');
  const debug = await recommendationsService.getDebugInfo(String(user._id));
  
  console.log('\n📊 Debug Results:');
  console.log('User preferred categories:', JSON.stringify(debug.userPreferredCategories, null, 2));
  console.log('Match terms count:', debug.matchTerms?.length || 0);
  console.log('Sample match terms:', debug.matchTerms?.slice(0, 15).join(', ') + '...');
  console.log('Matched merchants:', debug.matchedMerchantCount);
  console.log('Matching offers:', debug.offersMatchingCategoryAndDateStatus);
  
  if (debug.sampleMatchingOffers?.length) {
    console.log('\nSample matching offers:');
    debug.sampleMatchingOffers.forEach((o, i) => {
      console.log(`  ${i+1}. ${o.title} (${o.category}) - ${o.merchantName}`);
    });
  } else {
    console.log('\n❌ No matching offers found!');
  }

  // Also test getRecommendedDeals directly
  console.log('\n\n🎯 Testing getRecommendedDeals(limit=8)...');
  const result = await recommendationsService.getRecommendedDeals(String(user._id), 1, 8);
  console.log(`Returned ${result.data?.length || 0} deals`);
  if (result.data?.length) {
    console.log('Deals:');
    result.data.forEach((d, i) => {
      console.log(`  ${i+1}. ${d.title} (${d.category}) - ${d.merchantName}`);
    });
  } else {
    console.log('❌ No deals returned!');
  }

  await app.close();
  await mongoose.disconnect();
  console.log('\n✅ Test complete');
}

runTest().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

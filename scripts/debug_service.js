// Call getDebugInfo directly via NestJS app context
const mongoose = require('mongoose');
require('dotenv').config({ path: 'D:/GOLO/GOLO-New/NEW/GOLO_Backend_new/.env' });
const path = require('path');

async function debugViaService() {
  // Need to set NODE_PATH to include dist and src
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const recommendationsService = app.get('RecommendationsService');
  
  // Find a test user ID
  const db = mongoose.connection.db || (await mongoose.connect(process.env.MONGODB_URI)).connection.db;
  const user = await db.collection('users').findOne({ preferredCategories: { $exists: true, $ne: [] } });
  
  console.log(`🔍 Debug for user: ${user.email}`);
  console.log(`User ID: ${user._id}`);
  
  const debug = await recommendationsService.getDebugInfo(String(user._id));
  console.log('\n📋 Debug Info:');
  console.log(JSON.stringify(debug, null, 2));
  
  await app.close();
  await mongoose.disconnect();
}

debugViaService().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function runTests() {
  console.log('--- STARTING QA SPRINT TESTS ---');
  
  // 1. Test Guest Access
  console.log('\n[Task 1.1] Testing Guest Access (No Auth)...');
  const guestRes = await fetch('http://127.0.0.1:3005/v1/recommendations/homepage?lat=19.0505&lng=72.8316');
  const guestData = await guestRes.json();
  const guestSections = guestData.map(s => s.key);
  console.log('Guest sections returned:', guestSections);
  
  const hasPersonalized = guestSections.some(s => ['recently_viewed', 'continue_shopping', 'repeat_purchase', 'based_on_your_interests'].includes(s));
  if (hasPersonalized) {
    console.error('❌ FAILED: Guest received personalized sections!');
  } else {
    console.log('✅ PASSED: Guest only received non-personalized sections.');
  }

  // 2. Generate token for test user
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const user = await db.collection('users').findOne({ email: 'testuser@example.com' });
  await client.close();

  const token = jwt.sign(
    { sub: user._id, id: user._id, email: user.email, role: user.role }, 
    process.env.JWT_SECRET || 'super_secret_jwt_key_please_change_in_production'
  );

  // 3. Test Authenticated Access (with seeded history)
  console.log('\n[Task 1.1] Testing Authenticated Access (With History)...');
  const authRes = await fetch(`http://127.0.0.1:3005/v1/recommendations/homepage?lat=19.0505&lng=72.8316&userId=${user._id}`);
  const authData = await authRes.json();
  const authSections = authData.map(s => s.key);
  console.log('Authenticated sections returned:', authSections);
  
  const hasAuthPersonalized = authSections.includes('recently_viewed') && authSections.includes('continue_shopping');
  if (!hasAuthPersonalized) {
    console.error('❌ FAILED: Authenticated user missing personalized sections!');
  } else {
    console.log('✅ PASSED: Authenticated user received personalized sections.');
  }
}

runTests();

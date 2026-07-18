const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0';

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');

    const db = mongoose.connection.db;

    const plans = await db.collection('subscriptionplans').find({}).toArray();
    console.log('Available plans:', plans.map(p => p.name));

    // Find the trial plan
    let trialPlan = plans.find(p => p.name.toLowerCase().includes('trial') || p.name.toLowerCase().includes('free'));
    
    if (!trialPlan) {
      console.log('No trial or free plan found! Defaulting to "Basic" if available, or first plan.');
      trialPlan = plans.find(p => p.name.toLowerCase().includes('basic')) || plans[0];
    }
    
    if (!trialPlan) {
       console.log("Absolutely no plans found. Exiting.");
       process.exit(1);
    }
    console.log(`Using plan: ${trialPlan.name}`);

    const result = await db.collection('merchants').updateMany(
      {},
      {
        $set: {
          'subscription.planId': trialPlan.name,
          'subscription.status': 'TRIAL',
          'subscription.startedAt': new Date(),
          'subscription.expiresAt': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
          'subscription.billingCycle': 'monthly',
          'subscription.assignedBy': 'System Script',
          'subscription.assignedAt': new Date()
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} merchants out of ${result.matchedCount}`);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();

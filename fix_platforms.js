const mongoose = require('mongoose');

mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0')
.then(async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('categories');
  
  const goloCats = [
    'Food & Restaurants', 'Home Services', 'Beauty & Wellness', 'Healthcare & Medical',
    'Hotels & Accommodation', 'Shopping & Retail', 'Education & Training', 'Real Estate',
    'Events & Entertainment', 'Professional Services', 'Automotive Services',
    'Home Improvement', 'Fitness & Sports', 'Daily Needs & Utilities',
    'Local Businesses & Vendors', 'Vehicle Rent', 'Vehicle Buy', 'Property Rent', 'Property Buy',
    'Electronics & Home appliances' // Watch out for case sensitivity in db
  ];
  
  const chojaCats = [
    'Education', 'Vehicle', 'Property', 'Employment', 'Mobiles',
    'Electronics & Home Appliances', 'Matrimonial', 'Business', 'Astrology',
    'Lost & Found', 'Service', 'Personal', 'Pets', 'Public Notice',
    'Travel', 'Furniture', 'Greetings & Tributes', 'Other', 'Health & Wellness'
  ];
  
  await collection.updateMany(
    { name: { $in: goloCats } },
    { $set: { platform: 'golo' } }
  );
  
  await collection.updateMany(
    { name: { $in: chojaCats } },
    { $set: { platform: 'choja' } }
  );

  // Fallback case fixing
  await collection.updateMany(
    { name: 'Health & Wellness' },
    { $set: { platform: 'choja' } }
  );
  
  console.log('Corrected platform assignments');
  process.exit();
});

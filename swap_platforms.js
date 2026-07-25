const mongoose = require('mongoose');

mongoose.connect('mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0')
.then(async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('categories');
  
  // As per user feedback, GOLO = Main Marketplace Categories, CHOJA = GoLocal / Nearby Deals Categories
  
  const mainMarketplaceCats = [
    'Education', 'Vehicle', 'Property', 'Employment', 'Mobiles',
    'Electronics & Home Appliances', 'Matrimonial', 'Business', 'Astrology',
    'Lost & Found', 'Service', 'Personal', 'Pets', 'Public Notice',
    'Travel', 'Furniture', 'Greetings & Tributes', 'Other', 'Health & Wellness',
    'Electronics & Home appliances' // Added alternative capitalization
  ];
  
  const nearbyDealsCats = [
    'Food & Restaurants', 'Home Services', 'Beauty & Wellness', 'Healthcare & Medical',
    'Hotels & Accommodation', 'Shopping & Retail', 'Education & Training', 'Real Estate',
    'Events & Entertainment', 'Professional Services', 'Automotive Services',
    'Home Improvement', 'Fitness & Sports', 'Daily Needs & Utilities',
    'Local Businesses & Vendors', 'Vehicle Rent', 'Vehicle Buy', 'Property Rent', 'Property Buy'
  ];
  
  // Set Main Marketplace to GOLO
  await collection.updateMany(
    { name: { $in: mainMarketplaceCats } },
    { $set: { platform: 'golo' } }
  );
  
  // Set Nearby Deals to CHOJA
  await collection.updateMany(
    { name: { $in: nearbyDealsCats } },
    { $set: { platform: 'choja' } }
  );

  console.log('Swapped correctly');
  process.exit();
});

#!/usr/bin/env node

/**
 * MongoDB Index Creation Script
 * 
 * This script creates necessary indexes for the offers collection to improve query performance.
 * Run this once after deployment to ensure optimal database performance.
 * 
 * Usage:
 *   node scripts/create-mongodb-indexes.js
 * 
 * Or via npm:
 *   npm run db:create-indexes
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env file');
  process.exit(1);
}

const indexCreationConfig = [
  {
    collection: 'offers',
    indexes: [
      {
        // Bug Fix #3: Index for status-based queries (getNearbyOffers)
        spec: { status: 1, createdAt: -1 },
        options: { name: 'status_createdAt_idx' },
        description: 'Status + creation date for nearby offers queries'
      },
      {
        // Optimize merchant-specific offers lookups
        spec: { merchantId: 1, status: 1 },
        options: { name: 'merchantId_status_idx' },
        description: 'Merchant + status for merchant offers queries'
      },
      {
        // Optimize category-based queries
        spec: { category: 1, status: 1 },
        options: { name: 'category_status_idx' },
        description: 'Category + status for category-filtered queries'
      },
      {
        // Ensure requestId uniqueness
        spec: { requestId: 1 },
        options: { unique: true, sparse: true, name: 'requestId_unique_idx' },
        description: 'Unique identifier for offers'
      },
    ]
  }
];

async function createIndexes() {
  let connection = null;
  
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    for (const config of indexCreationConfig) {
      const { collection, indexes } = config;
      console.log(`\n📦 Processing collection: ${collection}`);
      
      const col = db.collection(collection);
      
      // List existing indexes
      const existingIndexes = await col.listIndexes().toArray();
      const existingIndexNames = existingIndexes.map(idx => idx.name);
      console.log(`   Existing indexes: ${existingIndexNames.join(', ')}`);
      
      for (const indexConfig of indexes) {
        const { spec, options, description } = indexConfig;
        const indexName = options.name || JSON.stringify(spec);
        
        try {
          if (existingIndexNames.includes(options.name || indexName)) {
            console.log(`   ⏭️  Index already exists: ${options.name || indexName}`);
            console.log(`       (${description})`);
          } else {
            console.log(`   📝 Creating index: ${options.name || indexName}`);
            console.log(`       Spec: ${JSON.stringify(spec)}`);
            console.log(`       Description: ${description}`);
            
            await col.createIndex(spec, options);
            
            console.log(`   ✅ Index created successfully`);
          }
        } catch (error) {
          console.error(`   ❌ Failed to create index ${options.name || indexName}:`);
          console.error(`       ${error.message}`);
        }
      }
    }
    
    console.log('\n🎉 Index creation completed!');
    console.log('\n📊 Final Index List:');
    
    for (const config of indexCreationConfig) {
      const { collection } = config;
      const col = db.collection(collection);
      const finalIndexes = await col.listIndexes().toArray();
      console.log(`\n${collection}:`);
      finalIndexes.forEach((idx, i) => {
        console.log(`  ${i + 1}. ${idx.name}`);
        console.log(`     Spec: ${JSON.stringify(idx.key)}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run the script
createIndexes();

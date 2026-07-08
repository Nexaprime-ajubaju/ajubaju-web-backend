const mongoose = require('mongoose');

async function test() {
  const uri = process.env.MONGODB_URI || "mongodb://tech_db_user:GSY9LPH1aTuugMl3@ac-ravr8vc-shard-00-00.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-01.paef2iz.mongodb.net:27017,ac-ravr8vc-shard-00-02.paef2iz.mongodb.net:27017/?ssl=true&replicaSet=atlas-11njkq-shard-0&authSource=admin&appName=Cluster0";
  await mongoose.connect(uri);
  
  const db = mongoose.connection.db;
  const userId = "6a49feb81808e29aad97ada4";
  
  console.log("Mocking Outbox...");
  try {
    await db.collection('outboxevents').insertOne({
      topic: 'user.deleted',
      payload: {
        userId,
        adminId: 'mock-admin',
        adminEmail: 'mock@admin.com',
        timestamp: new Date().toISOString()
      },
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("Outbox success.");
  } catch (e) {
    console.log("Outbox failed:", e.message);
  }

  console.log("Mocking findByIdAndDelete...");
  try {
    await db.collection('users').findOneAndDelete({ _id: new mongoose.Types.ObjectId(userId) });
    console.log("Delete success.");
  } catch (e) {
    console.log("Delete failed:", e.message);
  }

  console.log("Mocking Audit Log...");
  try {
    // using session
    const session = await mongoose.startSession();
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    
    await db.collection('auditlogs').insertOne({
      action: 'USER_DELETED_BY_ADMIN',
      adminId: 'mock-admin',
      adminEmail: 'mock@admin.com',
      targetId: userId,
      targetType: 'User',
      createdAt: new Date()
    }, { session });
    
    await session.commitTransaction();
    session.endSession();
    console.log("Audit log success.");
  } catch (e) {
    console.log("Audit log failed:", e.message);
  }

  await mongoose.disconnect();
}

test().catch(console.error);

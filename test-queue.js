const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { Schema } = mongoose;

const BannerQueueSchema = new Schema({
  city: { type: String, required: true, unique: true, index: true },
  queue: { type: [String], default: [] },
  version: { type: Number, required: true, default: 1 },
  activeVersion: { type: Number, required: true, default: 1 },
  pendingVersion: { type: Number, required: true, default: 1 },
  totalCampaigns: { type: Number, required: true, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'banner_city_queues' });

const BannerQueue = mongoose.model('BannerQueue', BannerQueueSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/golo');
    console.log('Connected to DB');
    
    let existingQueue = await BannerQueue.findOne({ city: 'global' }).exec();
    console.log('Existing queue:', existingQueue);
    
    if (!existingQueue) {
      existingQueue = new BannerQueue({
        city: 'global',
        queue: ['req1', 'req2'],
        version: 1,
        activeVersion: 1,
        pendingVersion: 1,
        totalCampaigns: 2,
        updatedAt: new Date(),
      });
      console.log('Saving new queue...');
      await existingQueue.save();
      console.log('Saved successfully');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();

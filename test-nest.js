const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { BannerRotationSchedulerService } = require('./dist/banners/services/banner-rotation-scheduler.service');
const { BannerCacheService } = require('./dist/banners/services/banner-cache.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const scheduler = app.get(BannerRotationSchedulerService);
  await scheduler.rotateCitySlots('kolhapur');
  console.log('Rotation completed');
  
  const cache = app.get(BannerCacheService);
  const slots = await cache.getAllSlots('kolhapur');
  console.log('Slots:', Object.keys(slots).length);
  Object.keys(slots).forEach(k => console.log('Slot', k, slots[k].requestId));
  
  await app.close();
}
run();

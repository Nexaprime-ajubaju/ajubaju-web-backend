const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { BannerQueueService } = require('./dist/banners/services/banner-queue.service');
const { BannerRotationSchedulerService } = require('./dist/banners/services/banner-rotation-scheduler.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const queue = app.get(BannerQueueService);
  await queue.rebuildCityQueue('kolhapur');
  console.log('Rebuilt Kolhapur queue');
  
  const scheduler = app.get(BannerRotationSchedulerService);
  await scheduler.rotateCitySlots('kolhapur');
  console.log('Rotated Kolhapur slots');
  
  await app.close();
}
run();

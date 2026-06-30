import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { TrendingJob } from './trending.job';
import { FbtJob } from './fbt.job';
import { SimilarProductsJob } from './similar-products.job';
import { SimilarCustomersJob } from './similar-customers.job';
import { OfflineRecommendationJob } from './offline-job.interface';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class OfflineJobSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OfflineJobSchedulerService.name);
  private jobs: OfflineRecommendationJob[] = [];

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly trendingJob: TrendingJob,
    private readonly fbtJob: FbtJob,
    private readonly similarProductsJob: SimilarProductsJob,
    private readonly similarCustomersJob: SimilarCustomersJob,
    private readonly redisService: RedisService,
  ) {
    // Registry of offline intelligence jobs
    this.jobs = [
      this.trendingJob,
      this.fbtJob,
      this.similarProductsJob,
      this.similarCustomersJob
    ];
  }

  onApplicationBootstrap() {
    this.registerJobs();
  }

  private registerJobs() {
    for (const job of this.jobs) {
      const cronJob = new CronJob(job.schedule, async () => {
        this.logger.log(`Executing Offline Job: ${job.key}`);
        try {
          await job.execute();
          await this.invalidateCache(job.key);
          this.logger.log(`Offline Job ${job.key} completed successfully.`);
        } catch (error) {
          this.logger.error(`Offline Job ${job.key} failed: ${error.message}`);
        }
      });

      this.schedulerRegistry.addCronJob(job.key, cronJob);
      cronJob.start();
      this.logger.log(`Registered offline job '${job.key}' with schedule: ${job.schedule}`);
    }
  }

  private async invalidateCache(jobKey: string) {
    // Instead of wildcard DEL, we use versioned cache invalidation.
    // Increment the cache version, instantly invalidating all old keys.
    try {
      const currentVersion = (await this.redisService.get('recommendation:cache:version')) || '1';
      const nextVersion = parseInt(currentVersion, 10) + 1;
      await this.redisService.set('recommendation:cache:version', nextVersion.toString(), 0); // 0 = no TTL
      this.logger.log(`Incremented recommendation cache version to ${nextVersion} (Trigger: ${jobKey})`);
    } catch (error) {
      this.logger.error(`Failed to increment cache version for ${jobKey}: ${error.message}`);
    }
  }
}

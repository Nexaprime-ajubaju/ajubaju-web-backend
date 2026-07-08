import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { Experiment, ExperimentDocument } from './schemas/experiment.schema';

@Injectable()
export class ExperimentService {
  private readonly logger = new Logger(ExperimentService.name);

  // Cache active experiments to avoid DB hits on every request
  private activeExperiments: Experiment[] = [];
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(
    @InjectModel(Experiment.name)
    private readonly experimentModel: Model<ExperimentDocument>,
  ) {}

  /**
   * Assigns a user to a variant based on active experiments.
   * Deterministic assignment via MD5 hash of userId + experimentName.
   */
  async assignVariant(
    userId: string,
    experimentName?: string,
  ): Promise<string> {
    if (!userId) return 'default';

    await this.refreshCacheIfExpired();

    // If an experiment is explicitly requested, evaluate it, otherwise evaluate the first active one
    let activeExperiment = null;
    if (experimentName) {
      activeExperiment = this.activeExperiments.find(
        (e) => e.name === experimentName && e.status === 'active',
      );
    } else {
      activeExperiment = this.activeExperiments.find(
        (e) => e.status === 'active',
      );
    }

    if (!activeExperiment || activeExperiment.variants.length === 0) {
      return 'default';
    }

    // Hash userId + experimentName to get a deterministic integer between 0 and 99
    const hashStr = `${userId}-${activeExperiment.name}`;
    const hashHex = createHash('md5').update(hashStr).digest('hex');
    const hashInt = parseInt(hashHex.substring(0, 8), 16);
    const splitPoint = hashInt % 100;

    // Evaluate variants based on cumulative weights
    let cumulativeWeight = 0;
    for (const variant of activeExperiment.variants) {
      cumulativeWeight += variant.weight;
      if (splitPoint < cumulativeWeight) {
        return variant.key;
      }
    }

    return 'default'; // Fallback
  }

  private async refreshCacheIfExpired() {
    const now = Date.now();
    if (now - this.lastFetchTime > this.CACHE_TTL_MS) {
      try {
        this.activeExperiments = await this.experimentModel
          .find({ status: 'active' })
          .lean();
        this.lastFetchTime = now;
      } catch (error) {
        this.logger.error(`Failed to refresh experiments: ${error.message}`);
      }
    }
  }
}

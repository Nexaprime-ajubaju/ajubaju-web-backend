import { Injectable, Logger } from '@nestjs/common';
import { RankingWeights } from './ranking.service';

@Injectable()
export class RankingConfigService {
  private readonly logger = new Logger(RankingConfigService.name);

  // In a real system, these might be fetched from a DB, Redis, or LaunchDarkly.
  private readonly configs: Record<string, RankingWeights> = {
    default: {
      affinity: 0.4,
      distance: 0.3,
      popularity: 0.2,
      freshness: 0.1,
    },
    'popularity-heavy': {
      affinity: 0.2,
      distance: 0.2,
      popularity: 0.5,
      freshness: 0.1,
    },
    'affinity-heavy': {
      affinity: 0.6,
      distance: 0.2,
      popularity: 0.1,
      freshness: 0.1,
    },
    'distance-only': {
      affinity: 0.0,
      distance: 1.0,
      popularity: 0.0,
      freshness: 0.0,
    },
  };

  /**
   * Retrieves the ranking configuration for a specific variant.
   * If the variant doesn't exist, it falls back to 'default'.
   */
  getConfig(variant: string = 'default'): RankingWeights {
    if (this.configs[variant]) {
      return this.configs[variant];
    }

    this.logger.warn(
      `Config variant '${variant}' not found. Falling back to 'default'.`,
    );
    return this.configs['default'];
  }
}

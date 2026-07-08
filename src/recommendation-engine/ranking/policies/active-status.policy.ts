import { Injectable, Logger } from '@nestjs/common';
import { RankingPolicy } from './ranking-policy.interface';
import { CandidateWithScore } from '../ranking.service';

@Injectable()
export class ActiveStatusPolicy implements RankingPolicy {
  private readonly logger = new Logger(ActiveStatusPolicy.name);
  readonly key = 'active_status';

  apply(candidates: CandidateWithScore[], limit: number): CandidateWithScore[] {
    const filtered = candidates.filter((c) => {
      const p = c.product;
      if (p.status !== 'active') return false;
      if (p.autoDisabled) return false;
      return true;
    });

    if (filtered.length < candidates.length) {
      this.logger.debug(
        `ActiveStatusPolicy removed ${candidates.length - filtered.length} candidates`,
      );
    }

    return filtered;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { RankingPolicy } from './ranking-policy.interface';
import { CandidateWithScore } from '../ranking.service';

@Injectable()
export class ProgressiveDiversityPolicy implements RankingPolicy {
  private readonly logger = new Logger(ProgressiveDiversityPolicy.name);
  readonly key = 'progressive_diversity';

  apply(candidates: CandidateWithScore[], limit: number): CandidateWithScore[] {
    // Level 1: Strict constraints
    const level1Result = this.applyConstraints(candidates, limit, {
      maxPerMerchant: 2,
      maxPerCategory: 3,
      minUniqueMerchants: 5,
      minUniqueCategories: 6,
    });

    if (level1Result) {
      this.logger.debug('ProgressiveDiversityPolicy: Level 1 satisfied');
      this.markAdjustment(level1Result, 'diversity_level_1');
      return level1Result;
    }

    // Level 2: Medium constraints
    const level2Result = this.applyConstraints(candidates, limit, {
      maxPerMerchant: 3,
      maxPerCategory: 4,
      minUniqueMerchants: 3,
      minUniqueCategories: 4,
    });

    if (level2Result) {
      this.logger.debug(
        'ProgressiveDiversityPolicy: Level 2 satisfied (fallback)',
      );
      this.markAdjustment(level2Result, 'diversity_level_2');
      return level2Result;
    }

    // Level 3: Loose constraints (deduplicate exact items only)
    this.logger.debug(
      'ProgressiveDiversityPolicy: Level 3 satisfied (last resort)',
    );
    const level3Result =
      this.applyConstraints(candidates, limit, {
        maxPerMerchant: 999, // Basically infinite
        maxPerCategory: 999,
        minUniqueMerchants: 1,
        minUniqueCategories: 1,
      }) || candidates.slice(0, limit);

    this.markAdjustment(level3Result, 'diversity_level_3');
    return level3Result;
  }

  private applyConstraints(
    candidates: CandidateWithScore[],
    limit: number,
    constraints: {
      maxPerMerchant: number;
      maxPerCategory: number;
      minUniqueMerchants: number;
      minUniqueCategories: number;
    },
  ): CandidateWithScore[] | null {
    const result: CandidateWithScore[] = [];
    const uniqueMerchants = new Set<string>();
    const uniqueCategories = new Set<string>();

    // Track counts to enforce maximums
    const merchantCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    for (const candidate of candidates) {
      if (result.length >= limit) break;

      const merchantId = candidate.product.userId || 'unknown';
      const category = candidate.product.category || 'unknown';

      const mCount = merchantCounts[merchantId] || 0;
      const cCount = categoryCounts[category] || 0;

      if (
        mCount < constraints.maxPerMerchant &&
        cCount < constraints.maxPerCategory
      ) {
        result.push(candidate);

        merchantCounts[merchantId] = mCount + 1;
        categoryCounts[category] = cCount + 1;
        uniqueMerchants.add(merchantId);
        uniqueCategories.add(category);
      }
    }

    // If we didn't get any results (unlikely unless empty input), fail constraint check
    if (result.length === 0) return null;

    // Check minimum uniqueness constraints
    if (
      uniqueMerchants.size < constraints.minUniqueMerchants ||
      uniqueCategories.size < constraints.minUniqueCategories
    ) {
      return null;
    }

    return result;
  }

  private markAdjustment(results: CandidateWithScore[], level: string) {
    results.forEach((r) => {
      r.policyAdjustments = r.policyAdjustments || [];
      r.policyAdjustments.push(level);
    });
  }
}

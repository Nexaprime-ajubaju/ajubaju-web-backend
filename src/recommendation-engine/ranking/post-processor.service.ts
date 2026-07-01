import { Injectable, Logger } from '@nestjs/common';
import { CandidateWithScore } from './ranking.service';
import { RankingPolicy } from './policies/ranking-policy.interface';
import { ActiveStatusPolicy } from './policies/active-status.policy';
import { ProgressiveDiversityPolicy } from './policies/progressive-diversity.policy';

@Injectable()
export class PostProcessorService {
  private readonly logger = new Logger(PostProcessorService.name);
  private policies: RankingPolicy[];

  constructor(
    private readonly activeStatusPolicy: ActiveStatusPolicy,
    private readonly diversityPolicy: ProgressiveDiversityPolicy,
  ) {
    // Execution order matters. Filter dead items before attempting diversity.
    this.policies = [
      this.activeStatusPolicy,
      this.diversityPolicy
    ];
  }

  /**
   * Applies business rules and diversity filtering sequentially to a ranked list of candidates.
   */
  process(rankedCandidates: CandidateWithScore[], limit: number = 15): any[] {
    let currentCandidates = [...rankedCandidates];

    for (const policy of this.policies) {
      currentCandidates = policy.apply(currentCandidates, limit);
    }

    // Map to final payload, attaching explainability metrics
    return currentCandidates.map(s => {
      const p = s.product;
      p.id = p._id ? p._id.toString() : p.id;
      
      // Explainability Enrichment
      p.recommendationExplainability = {
        finalScore: s.finalScore,
        components: s.components,
        matchedTags: s.matchedTags,
        matchedCategories: s.matchedCategories,
        policyAdjustments: s.policyAdjustments,
        reasons: s.reasons
      };
      
      return p;
    });
  }
}


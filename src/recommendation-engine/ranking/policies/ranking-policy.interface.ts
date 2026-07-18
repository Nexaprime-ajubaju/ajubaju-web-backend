import { CandidateWithScore } from '../ranking.service';

export interface RankingPolicy {
  readonly key: string;
  apply(candidates: CandidateWithScore[], limit: number): CandidateWithScore[];
}

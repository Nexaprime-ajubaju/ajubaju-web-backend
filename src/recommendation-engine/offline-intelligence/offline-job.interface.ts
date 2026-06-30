export interface OfflineRecommendationJob {
  readonly key: string;
  readonly schedule: string;
  execute(): Promise<void>;
}

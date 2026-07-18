export interface RecommendationStrategy {
  readonly key: string;
  execute(userId?: string, context?: any, limit?: number): Promise<any[]>;
}

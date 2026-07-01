export class RecommendationSectionMetadataDto {
  generatedAt: string;
  cacheHit: boolean;
  strategyVersion: string;
  totalProducts: number;
  experimentVariant?: string;
  requestId?: string;
  confidence: number;
  reason: string;
  source: string;
  fallbackUsed?: boolean;
  retrievedCandidates?: number;
  returnedProducts?: number;
  executionTime?: number;
}

export class RecommendationSectionDto {
  key: string;
  title: string;
  strategy: string;
  products: any[];
  metadata: RecommendationSectionMetadataDto;
}

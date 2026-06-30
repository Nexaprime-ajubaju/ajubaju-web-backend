export class RecommendationSectionMetadataDto {
  generatedAt: string;
  cacheHit: boolean;
  strategyVersion: string;
  totalProducts: number;
  requestId?: string;
}

export class RecommendationSectionDto {
  key: string;
  title: string;
  strategy: string;
  products: any[];
  metadata: RecommendationSectionMetadataDto;
}

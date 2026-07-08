import { HomepageRecommendationService } from './homepage-recommendation.service';

describe('HomepageRecommendationService', () => {
  it('falls back to a generic section when a personalized section has too few products', async () => {
    const recommendationService = {
      executeStrategy: jest.fn(),
    } as any;

    const configService = {
      getConfig: jest.fn().mockResolvedValue({
        sections: [
          {
            key: 'recently_viewed',
            strategy: 'recently_viewed',
            title: 'Recently Viewed',
            enabled: true,
            limit: 10,
            displayOrder: 1,
          },
        ],
      }),
    } as any;

    const envConfigService = {
      get: jest.fn((_, defaultValue) => defaultValue),
    } as any;

    const service = new HomepageRecommendationService(
      recommendationService,
      configService,
      envConfigService,
    );

    recommendationService.executeStrategy
      .mockResolvedValueOnce({
        key: 'recently_viewed',
        title: 'Recently Viewed',
        products: [],
        metadata: { confidence: 0.2, reason: 'empty', source: 'fallback' },
      })
      .mockResolvedValueOnce({
        key: 'trending',
        title: 'Trending',
        products: [
          { id: '1', title: 'Deal' },
          { id: '2', title: 'Deal 2' },
          { id: '3', title: 'Deal 3' },
          { id: '4', title: 'Deal 4' },
        ],
        metadata: { confidence: 0.8, reason: 'fallback', source: 'online' },
      });

    const result = await service.getHomepage({ userId: 'user-1' });

    expect(recommendationService.executeStrategy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('recently_viewed');
    expect(result[0].strategy).toBe('trending');
    expect(result[0].metadata.resolvedStrategy).toBe('trending');
    expect(result[0].products).toHaveLength(4);
  });
});

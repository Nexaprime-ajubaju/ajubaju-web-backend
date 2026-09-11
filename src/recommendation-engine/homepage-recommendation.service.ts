import { Injectable, Logger } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { HomepageConfigService } from '../homepage-config/homepage-config.service';
import { RecommendationContext } from './interfaces/recommendation.context';
import { RecommendationSectionDto } from './dto/recommendation-section.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HomepageRecommendationService {
  private readonly logger = new Logger(HomepageRecommendationService.name);

  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly configService: HomepageConfigService,
    private readonly envConfigService: ConfigService,
  ) {}

  async getHomepage(
    context: RecommendationContext,
  ): Promise<RecommendationSectionDto[]> {
    const config = await this.configService.getConfig();
    const enabledSections = config.sections
      .filter((section) => section.enabled)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const minConfidence = this.envConfigService.get<number>(
      'RECOMMENDATION_MIN_CONFIDENCE',
      0.55,
    );
    const minProducts = Math.max(
      1,
      this.envConfigService.get<number>('RECOMMENDATION_MIN_PRODUCTS', 1),
    );

    const promises = enabledSections.map(async (section) => {
      try {
        return await this.executeSection(
          section,
          context,
          requestId,
          minProducts,
          minConfidence,
        );
      } catch (error) {
        this.logger.error(
          `Unhandled error rendering section ${section.key}`,
          error,
        );
        return null;
      }
    });

    const results = await Promise.allSettled(promises);
    const homepagePayload: RecommendationSectionDto[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        homepagePayload.push(result.value);
      }
    }

    return homepagePayload;
  }

  private async executeSection(
    section: any,
    context: RecommendationContext,
    requestId: string,
    minProducts: number,
    minConfidence: number,
  ): Promise<RecommendationSectionDto | null> {
    const primaryStrategy = section.strategy || section.key;
    const strategyContext = { ...context, limit: section.limit || 10 };

    const sectionResult = await this.recommendationService.executeStrategy(
      primaryStrategy,
      strategyContext,
      section.title,
      requestId,
    );

    const products = sectionResult?.products || [];
    const confidence = sectionResult?.metadata?.confidence || 0;

    if (products.length >= minProducts && confidence >= minConfidence) {
      this.logger.debug(
        `Section ${section.key} resolved with strategy ${primaryStrategy} (${products.length} products, confidence ${confidence})`,
      );

      return {
        ...sectionResult,
        key: section.key,
        title: section.title,
        strategy: primaryStrategy,
        metadata: {
          ...sectionResult.metadata,
          requestedStrategy: primaryStrategy,
          resolvedStrategy: primaryStrategy,
          sectionKey: section.key,
        },
      };
    }

    if (section.fallbackStrategy) {
      this.logger.debug(
        `Section ${section.key} falling back to ${section.fallbackStrategy}`,
      );
      const fallbackResult = await this.recommendationService.executeStrategy(
        section.fallbackStrategy,
        strategyContext,
        section.title,
        requestId,
      );

      const fallbackProducts = fallbackResult?.products || [];
      const fallbackConfidence = fallbackResult?.metadata?.confidence || 0;

      if (fallbackProducts.length > 0) {
        return {
          ...fallbackResult,
          key: section.key,
          title: section.title,
          strategy: section.fallbackStrategy,
          metadata: {
            ...fallbackResult.metadata,
            requestedStrategy: primaryStrategy,
            resolvedStrategy: section.fallbackStrategy,
            sectionKey: section.key,
          },
        };
      }
    }

    this.logger.debug(
      `Section ${section.key} using strategy ${primaryStrategy} produced ${products.length} products with confidence ${confidence}; returning null to omit section`,
    );

    return null;
  }
}

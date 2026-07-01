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

  async getHomepage(context: RecommendationContext): Promise<RecommendationSectionDto[]> {
    const config = await this.configService.getConfig();
    const enabledSections = config.sections
      .filter(section => section.enabled)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Parallel execution with isolation
    const promises = enabledSections.map(async section => {
      try {
        const strategyContext = { ...context, limit: section.limit || 10 };
        return await this.recommendationService.executeStrategy(
          section.strategy || section.key, 
          strategyContext,
          section.title,
          requestId
        );
      } catch (error) {
        this.logger.error(`Unhandled error rendering section ${section.key}`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(promises);

    const minConfidence = this.envConfigService.get<number>('RECOMMENDATION_MIN_CONFIDENCE', 0.55);
    const minProducts = this.envConfigService.get<number>('RECOMMENDATION_MIN_PRODUCTS', 4);

    const homepagePayload: RecommendationSectionDto[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const products = result.value.products || [];
        const confidence = result.value.metadata?.confidence || 0;
        
        if (products.length < minProducts) {
          this.logger.debug(`Skipping section ${result.value.key}: products.length (${products.length}) < minProducts (${minProducts})`);
          continue;
        }

        if (confidence < minConfidence) {
          this.logger.debug(`Skipping section ${result.value.key}: confidence (${confidence}) < minConfidence (${minConfidence})`);
          continue;
        }

        homepagePayload.push(result.value);
      }
    }

    return homepagePayload;
  }
}

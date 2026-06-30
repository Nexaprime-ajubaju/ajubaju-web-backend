import { Injectable, Logger } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { HomepageConfigService } from '../homepage-config/homepage-config.service';
import { RecommendationContext } from './interfaces/recommendation.context';
import { RecommendationSectionDto } from './dto/recommendation-section.dto';

@Injectable()
export class HomepageRecommendationService {
  private readonly logger = new Logger(HomepageRecommendationService.name);

  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly configService: HomepageConfigService
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
        return await this.recommendationService.executeStrategy(
          section.key, 
          context,
          section.title,
          requestId
        );
      } catch (error) {
        this.logger.error(`Unhandled error rendering section ${section.key}`, error);
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
}

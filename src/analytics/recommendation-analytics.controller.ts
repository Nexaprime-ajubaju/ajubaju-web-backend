import { Body, Controller, Post } from '@nestjs/common';
import { RecommendationAnalyticsService } from './recommendation-analytics.service';

@Controller('v1/analytics/events')
export class RecommendationAnalyticsController {
  constructor(
    private readonly analyticsService: RecommendationAnalyticsService,
  ) {}

  @Post()
  async reportEvents(@Body() body: any) {
    const events = body.events;
    if (Array.isArray(events)) {
      // Fire and forget (don't await) to return 202 Accepted quickly
      this.analyticsService
        .recordEvents(events)
        .catch((err) => console.error(err));
    }
    return { success: true };
  }
}

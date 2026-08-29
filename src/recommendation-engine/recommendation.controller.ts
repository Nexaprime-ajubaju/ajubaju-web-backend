import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { HomepageRecommendationService } from './homepage-recommendation.service';
import { RecommendationService } from './recommendation.service';
import { RecommendationContext } from './interfaces/recommendation.context';

@Controller(['v1/recommendations', 'recommendations'])
export class RecommendationController {
  constructor(
    private readonly homepageService: HomepageRecommendationService,
    private readonly recommendationService: RecommendationService,
  ) {}

  @Get('homepage')
  async getHomepage(@Query() query: any, @Req() req: any) {
    const context = this.buildContext(query, req);
    return this.homepageService.getHomepage(context);
  }

  @Get('products/:productId')
  async getProductRecommendations(
    @Param('productId') productId: string,
    @Query() query: any,
    @Req() req: any,
  ) {
    const context = this.buildContext(query, req);
    context.productId = productId;
    // FBT is the main strategy for PDP
    return this.recommendationService.executeStrategy(
      'frequently_bought_together',
      context,
      'Frequently Bought Together',
    );
  }

  @Get(':strategy')
  async getStrategy(
    @Param('strategy') strategy: string,
    @Query() query: any,
    @Req() req: any,
  ) {
    const context = this.buildContext(query, req);
    return this.recommendationService.executeStrategy(
      strategy,
      context,
      strategy,
    );
  }

  private buildContext(query: any, req: any): RecommendationContext {
    const latitude = query.latitude
      ? parseFloat(query.latitude)
      : query.lat
        ? parseFloat(query.lat)
        : undefined;
    const longitude = query.longitude
      ? parseFloat(query.longitude)
      : query.lng
        ? parseFloat(query.lng)
        : undefined;

    const rawCity = query.city || query.location || query.locationName;
    const normalizedCity = rawCity ? rawCity.toLowerCase().trim() : undefined;

    return {
      userId: req.user?.id || query.userId,
      latitude,
      longitude,
      coordinates:
        latitude !== undefined && longitude !== undefined
          ? { latitude, longitude }
          : undefined,
      city: normalizedCity,
      area: query.area || query.region,
      pincode: query.pincode,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 10,
      language: query.language,
      platform: query.platform,
      timezone: query.timezone,
      isGuest: !req.user,
    };
  }
}

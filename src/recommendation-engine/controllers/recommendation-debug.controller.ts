import { Controller, Get, Query, Logger, UseGuards } from '@nestjs/common';
import { RecommendationFactory } from '../recommendation.factory';
import { RecommendationContext } from '../interfaces/recommendation.context';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('admin/recommendations/debug')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RecommendationDebugController {
  private readonly logger = new Logger(RecommendationDebugController.name);

  constructor(
    private readonly recommendationFactory: RecommendationFactory,
  ) {}

  @Get()
  async debugRecommendations(
    @Query('userId') userId: string,
    @Query('strategy') strategyKey: string = 'interest',
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('variant') variant?: string,
  ) {
    this.logger.log(`Debugging strategy '${strategyKey}' for user '${userId}'`);
    
    const strategy = this.recommendationFactory.get(strategyKey);
    if (!strategy) {
      return { error: `Strategy '${strategyKey}' not found.` };
    }

    const context: RecommendationContext = {
      userId,
      coordinates: (lat && lng) ? { latitude: Number(lat), longitude: Number(lng) } : undefined,
      experimentVariant: variant,
      limit: 15
    };

    const results = await strategy.getRecommendations(context);

    // In a real debug scenario, we might want to bypass the PostProcessor mapping
    // But since our PostProcessor now attaches recommendationExplainability directly to the response,
    // we can just return the processed results and the admin will see the full metadata block.
    
    return {
      metadata: {
        userId,
        strategy: strategyKey,
        variant: variant || 'default',
        location: context.coordinates,
        returnedCount: results.products.length
      },
      results: results.products.map(r => ({
        productId: r._id || r.product?._id,
        title: r.title || r.product?.title,
        finalScore: r.finalScore,
        explainability: r.recommendationExplainability
      }))
    };
  }
}

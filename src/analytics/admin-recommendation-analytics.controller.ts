import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationMetric, RecommendationMetricDocument } from './schemas/recommendation-metric.schema';
import { RecommendationHealthService } from './recommendation-health.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('admin/recommendations/metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminRecommendationAnalyticsController {
  constructor(
    @InjectModel(RecommendationMetric.name) private readonly metricModel: Model<RecommendationMetricDocument>,
    private readonly healthService: RecommendationHealthService,
  ) {}

  @Get('health')
  async getHealthStatus() {
    return await this.healthService.getHealthStatus();
  }

  @Get()
  async getMetrics(
    @Query('strategy') strategy?: string,
    @Query('variant') variant?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const query: any = {};
    if (strategy) query.strategy = strategy;
    if (variant) query.variant = variant;
    
    if (startDate || endDate) {
      query.timeWindow = {};
      if (startDate) query.timeWindow.$gte = startDate;
      if (endDate) query.timeWindow.$lte = endDate;
    }

    const metrics = await this.metricModel.find(query).sort({ timeWindow: -1 }).lean();

    return {
      success: true,
      data: metrics,
    };
  }

  @Get('summary')
  async getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const match: any = {};
    if (startDate || endDate) {
      match.timeWindow = {};
      if (startDate) match.timeWindow.$gte = startDate;
      if (endDate) match.timeWindow.$lte = endDate;
    }

    const summary = await this.metricModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { strategy: '$strategy', variant: '$variant' },
          totalServed: { $sum: '$served' },
          totalViewed: { $sum: '$viewed' },
          totalClicked: { $sum: '$clicked' },
          totalPurchased: { $sum: '$purchased' },
        }
      },
      {
        $project: {
          strategy: '$_id.strategy',
          variant: '$_id.variant',
          totalServed: 1,
          totalViewed: 1,
          totalClicked: 1,
          totalPurchased: 1,
          ctr: { $cond: [{ $gt: ['$totalServed', 0] }, { $divide: ['$totalClicked', '$totalServed'] }, 0] },
          cvr: { $cond: [{ $gt: ['$totalClicked', 0] }, { $divide: ['$totalPurchased', '$totalClicked'] }, 0] },
        }
      },
      { $sort: { strategy: 1, variant: 1 } }
    ]);

    return {
      success: true,
      data: summary,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BannerImpression,
  BannerImpressionDocument,
} from '../schemas/banner-impression.schema';
import {
  BannerClick,
  BannerClickDocument,
} from '../schemas/banner-click.schema';

@Injectable()
export class BannerAnalyticsService {
  private readonly logger = new Logger(BannerAnalyticsService.name);

  constructor(
    @InjectModel(BannerImpression.name)
    private readonly impressionModel: Model<BannerImpressionDocument>,
    @InjectModel(BannerClick.name)
    private readonly clickModel: Model<BannerClickDocument>,
  ) {}

  /**
   * Get analytics dashboard stats for Admin or Merchant
   */
  async getBannerAnalytics(
    bannerId?: string,
    merchantId?: string,
    days: number = 30,
  ) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query: any = { shownAt: { $gte: startDate } };
    if (bannerId) query.bannerId = bannerId;
    if (merchantId) query.merchantId = merchantId;

    const clickQuery: any = { clickedAt: { $gte: startDate } };
    if (bannerId) clickQuery.bannerId = bannerId;
    if (merchantId) clickQuery.merchantId = merchantId;

    const [totalImpressions, totalClicks] = await Promise.all([
      this.impressionModel.countDocuments(query).exec(),
      this.clickModel.countDocuments(clickQuery).exec(),
    ]);

    const ctr =
      totalImpressions > 0
        ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2))
        : 0;

    return {
      timeframeDays: days,
      totalImpressions,
      totalClicks,
      ctrPercentage: ctr,
      timestamp: new Date(),
    };
  }
}

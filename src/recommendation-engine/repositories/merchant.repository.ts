import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationContext } from '../interfaces/recommendation.context';

// Assuming the Merchant document is imported or we use 'Merchant' injection token
@Injectable()
export class MerchantRepository {
  constructor(
    @InjectModel('Merchant') private readonly merchantModel: Model<any>,
  ) {}

  async findNearby(context: RecommendationContext): Promise<any[]> {
    if (!context.latitude || !context.longitude) {
      // Fallback if no location is provided
      return this.merchantModel
        .find({})
        .limit(context.limit || 20)
        .lean()
        .exec();
    }

    // $geoNear pipeline to get distance and filter nearby
    const pipeline: any[] = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [context.longitude, context.latitude],
          },
          distanceField: 'calculatedDistance',
          spherical: true,
          maxDistance: 20000, // e.g. 20km radius max
        },
      },
      // Only active merchants
      {
        $match: {
          isActive: true,
        },
      },
      {
        $limit: Math.min(100, (context.limit || 20) * 3), // Fetch a larger pool for scoring
      },
    ];

    return this.merchantModel.aggregate(pipeline).exec();
  }

  async findBestSellers(limit: number = 20): Promise<any[]> {
    return this.merchantModel
      .find({ isActive: true })
      .sort({ rating: -1, totalReviews: -1 }) // simple proxy for "best sellers"
      .limit(limit)
      .lean()
      .exec();
  }
}

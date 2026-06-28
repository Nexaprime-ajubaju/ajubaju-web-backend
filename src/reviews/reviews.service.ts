import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { Review, ReviewDocument, ReviewStatus } from './schemas/review.schema';
import { Voucher, VoucherDocument, VoucherStatus } from '../vouchers/schemas/voucher.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    @InjectModel(Voucher.name) private readonly voucherModel: Model<VoucherDocument>,
  ) {}

  private async findVoucherByIdentifier(voucherId: string) {
    if (/^[0-9a-fA-F]{24}$/.test(voucherId)) {
      return this.voucherModel.findById(voucherId);
    }

    return this.voucherModel.findOne({ voucherId });
  }

  async submitOfferReview(
    userId: string,
    voucherId: string,
    payload: { rating: number; content: string },
  ) {
    const rating = Number(payload?.rating);
    const content = String(payload?.content || '').trim();

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    if (!content) {
      throw new BadRequestException('Feedback is required');
    }

    const voucher = await this.findVoucherByIdentifier(voucherId);

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    if (String(voucher.userId) !== String(userId)) {
      throw new BadRequestException('You can only review your own redeemed voucher');
    }

    if (voucher.status !== VoucherStatus.REDEEMED) {
      throw new BadRequestException('Only redeemed vouchers can be reviewed');
    }

    let review = await this.reviewModel.findOne({ voucherId: voucher._id });

    if (!review) {
      review = new this.reviewModel({
        merchantId: voucher.merchantId,
        offerId: voucher.offerId,
        voucherId: voucher._id,
        userId: voucher.userId,
        rating,
        content,
        status: ReviewStatus.APPROVED,
      });
    } else {
      review.rating = rating;
      review.content = content;
      review.status = ReviewStatus.APPROVED;
    }

    await review.save();

    return {
      success: true,
      message: 'Review submitted successfully',
      data: {
        _id: String(review._id),
        voucherId: String(voucher._id),
        offerId: String(voucher.offerId),
        rating: review.rating,
        content: review.content,
        status: review.status,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      },
    };
  }

  async getOfferReviews(offerId: string, page = 1, limit = 10) {
    if (!Types.ObjectId.isValid(offerId)) {
      throw new NotFoundException('Offer not found');
    }

    const skip = (page - 1) * limit;
    const query = {
      offerId: new Types.ObjectId(offerId),
      status: ReviewStatus.APPROVED,
    };

    const [reviews, total, averageAgg, breakdownAgg] = await Promise.all([
      this.reviewModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reviewModel.countDocuments(query),
      this.reviewModel.aggregate([
        { $match: query },
        { $group: { _id: null, averageRating: { $avg: '$rating' } } },
      ]),
      this.reviewModel.aggregate([
        { $match: query },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    const userIds = reviews.map((r) => r.userId).filter(Boolean);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    breakdownAgg.forEach((row: any) => {
      const key = Number(row?._id);
      if (breakdown[key] !== undefined) {
        breakdown[key] = row.count;
      }
    });

    return {
      success: true,
      data: {
        reviews: reviews.map((r: any) => {
          const user = userMap.get(String(r.userId));
          return {
            _id: String(r._id),
            rating: r.rating,
            content: r.content,
            createdAt: r.createdAt,
            userName: user?.name || 'Customer',
            userEmail: user?.email || 'N/A',
          };
        }),
        stats: {
          totalReviews: total,
          averageRating: Number((averageAgg?.[0]?.averageRating || 0).toFixed(1)),
          breakdown,
        },
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantReviews(merchantId: string, page = 1, limit = 20, status?: string, search?: string) {
    const query: any = { merchantId: new Types.ObjectId(merchantId) };
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search?.trim()) {
      query.content = { $regex: search.trim(), $options: 'i' };
    }

    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.reviewModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reviewModel.countDocuments(query),
    ]);

    const userIds = reviews.map((r) => r.userId).filter(Boolean);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    return {
      success: true,
      data: reviews.map((r: any) => {
        const user = userMap.get(String(r.userId));
        return {
          _id: String(r._id),
          rating: r.rating,
          content: r.content,
          status: r.status,
          tags: r.tags || [],
          createdAt: r.createdAt,
          userName: user?.name || 'Unknown User',
          userEmail: user?.email || 'N/A',
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantReviewStats(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);

    const [totalReviews, pendingModeration, flaggedReviews, averageAgg] = await Promise.all([
      this.reviewModel.countDocuments({ merchantId: mId }),
      this.reviewModel.countDocuments({ merchantId: mId, status: ReviewStatus.PENDING }),
      this.reviewModel.countDocuments({ merchantId: mId, status: ReviewStatus.FLAGGED }),
      this.reviewModel.aggregate([
        { $match: { merchantId: mId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        totalReviews,
        pendingModeration,
        flaggedReviews,
        averageRating: Number((averageAgg?.[0]?.avgRating || 0).toFixed(2)),
      },
    };
  }

  async getPublicMerchantReviewStats(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);

    const [totalReviews, averageAgg] = await Promise.all([
      this.reviewModel.countDocuments({
        merchantId: mId,
        status: ReviewStatus.APPROVED,
      }),
      this.reviewModel.aggregate([
        {
          $match: {
            merchantId: mId,
            status: ReviewStatus.APPROVED,
          },
        },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        totalReviews,
        averageRating: Number((averageAgg?.[0]?.avgRating || 0).toFixed(1)),
      },
    };
  }

  async updateReviewStatus(merchantId: string, reviewId: string, status: ReviewStatus) {
    if (!Object.values(ReviewStatus).includes(status)) {
      throw new BadRequestException('Invalid review status');
    }

    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      merchantId: new Types.ObjectId(merchantId),
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.status = status;
    await review.save();

    return {
      success: true,
      message: 'Review status updated',
      data: {
        _id: String(review._id),
        status: review.status,
      },
    };
  }
}

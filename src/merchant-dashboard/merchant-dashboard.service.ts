import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ad, AdDocument } from '../ads/schemas/category-schemas/ad.schema';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../orders/schemas/order.schema';
import {
  MerchantProduct,
  MerchantProductDocument,
} from '../merchant-products/schemas/merchant-product.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Voucher, VoucherDocument } from '../vouchers/schemas/voucher.schema';
import {
  OfferLikeHistory,
  OfferLikeHistoryDocument,
} from '../offers/schemas/offer-like-history.schema';
import { RedisService } from '../common/services/redis.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { Follow, FollowDocument } from '../users/schemas/follow.schema';
import {
  OfferPromotion,
  OfferPromotionDocument,
} from '../offers/schemas/offer-promotion.schema';
import { MerchantDailyView } from '../merchants/schemas/merchant-daily-view.schema';

@Injectable()
export class MerchantDashboardService {
  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Voucher.name)
    private readonly voucherModel: Model<VoucherDocument>,
    @InjectModel(OfferLikeHistory.name)
    private readonly offerLikeHistoryModel: Model<OfferLikeHistoryDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    @InjectModel(Follow.name)
    private readonly followModel: Model<FollowDocument>,
    @InjectModel(OfferPromotion.name)
    private readonly offerPromotionModel: Model<OfferPromotionDocument>,
    @InjectModel(MerchantDailyView.name)
    private readonly merchantDailyViewModel: Model<MerchantDailyView>,
    private readonly redisService: RedisService,
    private readonly SubscriptionsService: SubscriptionsService,
  ) {}

  private buildDateBuckets(days: number) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - (days - 1));
    return this.buildDateRangeBuckets(start, now);
  }

  private buildDateRangeBuckets(startDate: Date, endDate: Date) {
    const labels: string[] = [];
    const keys: string[] = [];
    const counts = new Map<string, number>();

    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      keys.push(key);
      labels.push(
        current.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      );
      counts.set(key, 0);
      current.setDate(current.getDate() + 1);
    }

    return { keys, labels, counts };
  }

  private normalizeDeviceBreakdown(
    deviceCounts: Array<{ _id: string; count: number }>,
  ) {
    const normalized = {
      Mobile: 0,
      Desktop: 0,
      Tablet: 0,
    };

    let total = 0;
    for (const row of deviceCounts) {
      const platform = String(row._id || '').toLowerCase();
      const count = Number(row.count || 0);
      if (!count) continue;
      if (platform.includes('tablet') || platform.includes('ipad')) {
        normalized.Tablet += count;
      } else if (
        platform.includes('desktop') ||
        platform.includes('mac') ||
        platform.includes('windows') ||
        platform.includes('linux')
      ) {
        normalized.Desktop += count;
      } else {
        normalized.Mobile += count;
      }
      total += count;
    }

    if (!total) {
      return normalized;
    }

    return {
      Mobile: Math.round((normalized.Mobile / total) * 100),
      Desktop: Math.round((normalized.Desktop / total) * 100),
      Tablet: Math.max(
        0,
        100 -
          Math.round((normalized.Mobile / total) * 100) -
          Math.round((normalized.Desktop / total) * 100),
      ),
    };
  }

  private getPlatformFromUserAgent(userAgent?: string): string {
    const value = String(userAgent || '').toLowerCase();
    if (!value) return 'Unknown';
    if (value.includes('ipad') || value.includes('tablet')) return 'Tablet';
    if (
      value.includes('mobile') ||
      value.includes('android') ||
      value.includes('iphone')
    )
      return 'Mobile';
    if (
      value.includes('windows') ||
      value.includes('macintosh') ||
      value.includes('linux') ||
      value.includes('x11')
    )
      return 'Desktop';
    return 'Unknown';
  }

  private normalizeGender(value?: string) {
    const gender = String(value || '').toLowerCase();
    if (gender === 'male') return 'male';
    if (gender === 'female') return 'female';
    return 'other';
  }

  private getAgeGroup(dateOfBirth?: Date | string) {
    if (!dateOfBirth) return 'Unknown';
    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) return 'Unknown';

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && today.getDate() < birthDate.getDate())
    ) {
      age -= 1;
    }

    if (age < 18) return null;
    if (age <= 24) return '18-24';
    if (age <= 34) return '25-34';
    if (age <= 44) return '35-44';
    if (age <= 64) return '45-64';
    return '65+';
  }

  private getLocationLabel(user: any, mode: 'city' | 'state' = 'city') {
    const profile = user?.profile || {};
    if (mode === 'state' && profile.state) return String(profile.state).trim();
    if (profile.city) return String(profile.city).trim();
    if (profile.address) {
      const parts = String(profile.address)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length >= 3) return parts[parts.length - 3];
      if (parts.length) return parts[0];
    }
    if (profile.state) return String(profile.state).trim();
    return '';
  }

  private getClaimLocationLabel(value?: string) {
    const parts = String(value || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^\d{4,}$/.test(part));

    const knownCity = parts.find((part) =>
      /\b(kolhapur|mumbai|pune|sangli|delhi|bangalore|bengaluru|hyderabad|karvir|ichalkaranji)\b/i.test(
        part,
      ),
    );
    if (knownCity) return knownCity;

    if (parts.length >= 4) return parts[parts.length - 4];
    if (parts.length >= 2) return parts[parts.length - 2];
    return parts[0] || '';
  }

  private async getMerchantCustomerUserIds(merchantId: string) {
    const merchantObjectId = Types.ObjectId.isValid(merchantId)
      ? new Types.ObjectId(merchantId)
      : null;
    const [orderUserIds, voucherUserIds, likedUserIds] = await Promise.all([
      merchantObjectId
        ? this.orderModel.distinct('userId', { merchantId: merchantObjectId })
        : Promise.resolve([]),
      merchantObjectId
        ? this.voucherModel.distinct('userId', { merchantId: merchantObjectId })
        : Promise.resolve([]),
      this.offerLikeHistoryModel.distinct('userId', {
        merchantId: String(merchantId),
      }),
    ]);

    return Array.from(
      new Set(
        [...orderUserIds, ...voucherUserIds, ...likedUserIds]
          .map((value: any) => String(value || '').trim())
          .filter((value) => Types.ObjectId.isValid(value)),
      ),
    );
  }

  private async getMerchantCustomerUsers(merchantId: string) {
    const userIds = await this.getMerchantCustomerUserIds(merchantId);
    if (!userIds.length) return [];

    return this.userModel
      .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
      .select('name profile metadata createdAt')
      .lean()
      .exec();
  }

  private getRedemptionRedisKey(merchantId: string) {
    return `merchant:redemptions:daily:${merchantId}`;
  }

  async recordMerchantRedemption(merchantId: string, occurredAt = new Date()) {
    const redisClient = this.redisService.getClient();
    if (!redisClient || !merchantId) {
      return;
    }

    const dayKey = occurredAt.toISOString().slice(0, 10);
    const redisKey = this.getRedemptionRedisKey(merchantId);

    await redisClient.hIncrBy(redisKey, dayKey, 1);
    await redisClient.expire(redisKey, 60 * 60 * 24 * 60);
  }

  async getRedemptionTrend(
    merchantId: string,
    period: 'weekly' | 'monthly' = 'weekly',
  ) {
    const days = period === 'monthly' ? 30 : 7;
    const { keys, labels } = this.buildDateBuckets(days);
    const redisClient = this.redisService.getClient();
    const redemptionCounts = keys.map(() => 0);

    let usedRedis = false;
    if (redisClient) {
      try {
        const storedCounts = await redisClient.hGetAll(
          this.getRedemptionRedisKey(merchantId),
        );
        if (storedCounts && Object.keys(storedCounts).length > 0) {
          keys.forEach((key, index) => {
            redemptionCounts[index] = Number(storedCounts[key] || 0);
          });
          usedRedis = true;
        }
      } catch (err) {
        // ignore and fallback to DB
      }
    }

    // Fallback: if Redis not used or empty, aggregate from vouchers collection
    if (!usedRedis) {
      try {
        const start = new Date(keys[0]);
        const mObjId = new Types.ObjectId(merchantId);
        const rows = await this.voucherModel
          .aggregate([
            {
              $match: {
                merchantId: mObjId,
                status: 'redeemed',
                redeemedAt: { $gte: start },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$redeemedAt',
                    timezone: '+05:30',
                  },
                },
                count: { $sum: 1 },
              },
            },
          ])
          .exec();

        const rowMap = new Map<string, number>();
        for (const r of rows) {
          rowMap.set(r._id, Number(r.count || 0));
        }

        keys.forEach((key, index) => {
          redemptionCounts[index] = Number(rowMap.get(key) || 0);
        });
      } catch (err) {
        // leave counts zero if DB fallback fails
      }
    }

    return {
      labels,
      values: redemptionCounts,
      total: redemptionCounts.reduce((sum, count) => sum + count, 0),
      today: redemptionCounts[redemptionCounts.length - 1] || 0,
    };
  }

  async getSummary(merchantId: string, startDate?: Date, endDate?: Date) {
    const cacheKey = `analytics:summary:${merchantId}:${startDate?.toISOString() || 'all'}:${endDate?.toISOString() || 'all'}`;
    const cached = (await this.redisService.get(cacheKey)) as any;
    if (cached) return cached;

    const mId = new Types.ObjectId(merchantId);

    const end = endDate || new Date();
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // We calculate a dynamic "previous period" of equal length for trend comparison
    const durationMs = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - durationMs);
    const previousEnd = new Date(start.getTime() - 1);

    const thirtyDaysAgo = start;
    const sixtyDaysAgo = previousStart;

    const startOfWeek = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(end);
    startOfDay.setHours(0, 0, 0, 0);

    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .select('profileViews _id')
      .lean();
    const profileId = merchant?._id ? String(merchant._id) : null;
    const offerQuery = profileId
      ? { $or: [{ merchantId: String(merchantId) }, { merchantId: profileId }] }
      : { merchantId: String(merchantId) };
    const activeOfferQuery = { ...offerQuery, status: { $ne: 'expired' } };

    const [
      recentOrders,
      latestReviews,
      orderStats,
      reviewStats,
      adStats,
      redeemedVouchersCount,
      activeOffersCount,
      followersCount,
      customersList,
      todayOrderStats,
      todayRedemptionsCount,
      topPerformingOffers,
      l30StatsArr,
      p30StatsArr,
      offersL30,
      offersP30,
      followsL30,
      followsP30,
      todayClaimsCount,
      todayViewsData,
    ] = await Promise.all([
      this.orderModel
        .find({ merchantId: mId })
        .sort({ placedAt: -1 })
        .limit(4)
        .lean(),
      this.reviewModel
        .find({ merchantId: mId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      this.orderModel.aggregate([
        { $match: { merchantId: mId, placedAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
                    ],
                  },
                  '$amount',
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.reviewModel.aggregate([
        { $match: { merchantId: mId, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]),
      this.adModel.aggregate([
        {
          $match: { userId: merchantId, updatedAt: { $gte: start, $lte: end } },
        },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            weeklyViews: {
              $sum: {
                $cond: [{ $gte: ['$updatedAt', startOfWeek] }, '$views', 0],
              },
            },
          },
        },
      ]),
      this.voucherModel.countDocuments({
        merchantId: mId,
        status: 'redeemed',
        redeemedAt: { $gte: start, $lte: end },
      }),
      this.offerPromotionModel.countDocuments({
        ...activeOfferQuery,
        createdAt: { $gte: start, $lte: end },
      }),
      this.followModel.countDocuments({
        merchantId: {
          $in: [String(merchantId), String(mId), profileId].filter(Boolean),
        },
      }),
      this.getMerchantCustomerUserIds(merchantId),
      this.orderModel.aggregate([
        { $match: { merchantId: mId, placedAt: { $gte: startOfDay } } },
        {
          $group: {
            _id: null,
            todayOrders: { $sum: 1 },
            todayRevenue: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
                    ],
                  },
                  '$amount',
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.voucherModel.countDocuments({
        merchantId: mId,
        status: 'redeemed',
        redeemedAt: { $gte: startOfDay },
      }),
      this.offerPromotionModel
        .find(offerQuery)
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      // Custom Range Stats
      this.orderModel.aggregate([
        {
          $match: {
            merchantId: mId,
            placedAt: { $gte: thirtyDaysAgo, $lte: end },
          },
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
                    ],
                  },
                  '$amount',
                  0,
                ],
              },
            },
          },
        },
      ]),
      // Prev Equal Length Range Stats
      this.orderModel.aggregate([
        {
          $match: {
            merchantId: mId,
            placedAt: { $gte: sixtyDaysAgo, $lte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [OrderStatus.ACCEPTED, OrderStatus.COMPLETED],
                    ],
                  },
                  '$amount',
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.offerPromotionModel.countDocuments({
        ...offerQuery,
        createdAt: { $gte: thirtyDaysAgo, $lte: end },
      }),
      this.offerPromotionModel.countDocuments({
        ...offerQuery,
        createdAt: { $gte: sixtyDaysAgo, $lte: thirtyDaysAgo },
      }),
      this.followModel.countDocuments({
        merchantId: {
          $in: [String(merchantId), String(mId), profileId].filter(Boolean),
        },
        createdAt: { $gte: thirtyDaysAgo, $lte: end },
      }),
      this.followModel.countDocuments({
        merchantId: {
          $in: [String(merchantId), String(mId), profileId].filter(Boolean),
        },
        createdAt: { $gte: sixtyDaysAgo, $lte: thirtyDaysAgo },
      }),
      this.voucherModel.countDocuments({
        merchantId: mId,
        createdAt: { $gte: startOfDay },
      }),
      this.merchantDailyViewModel
        .findOne({
          merchantId: String(merchantId),
          date: new Date().toISOString().split('T')[0],
        })
        .lean(),
    ]);

    const offerIds = topPerformingOffers.map((o: any) => o._id);
    const offerVouchers = await this.voucherModel
      .find({ offerId: { $in: offerIds } })
      .select('offerId voucherId status')
      .lean();

    const offerStatsMap = new Map();
    const voucherToOfferMap = new Map();

    for (const v of offerVouchers) {
      const oId = String(v.offerId);
      voucherToOfferMap.set(v.voucherId, oId);
      if (!offerStatsMap.has(oId)) {
        offerStatsMap.set(oId, { claimed: 0, redeemed: 0, revenue: 0 });
      }
      offerStatsMap.get(oId).claimed += 1;
      if (v.status === 'redeemed') {
        offerStatsMap.get(oId).redeemed += 1;
      }
    }

    const voucherIds = offerVouchers.map((v) => v.voucherId).filter(Boolean);
    if (voucherIds.length > 0) {
      const orderRevenue = await this.orderModel.aggregate([
        {
          $match: {
            voucherId: { $in: voucherIds },
            status: { $in: ['accepted', 'completed'] },
          },
        },
        { $group: { _id: '$voucherId', totalRevenue: { $sum: '$amount' } } },
      ]);

      for (const o of orderRevenue) {
        const offerId = voucherToOfferMap.get(o._id);
        if (offerId && offerStatsMap.has(offerId)) {
          offerStatsMap.get(offerId).revenue += o.totalRevenue;
        }
      }
    }

    const recentOrderUserIds = recentOrders
      .map((o: any) => o.userId)
      .filter(Boolean);
    const recentOrderUsers = await this.userModel
      .find({ _id: { $in: recentOrderUserIds } })
      .select('name')
      .lean();
    const recentOrderUserMap = new Map(
      recentOrderUsers.map((u: any) => [String(u._id), u.name]),
    );

    const reviewUserIds = latestReviews
      .map((r: any) => r.userId)
      .filter(Boolean);
    const reviewUsers = await this.userModel
      .find({ _id: { $in: reviewUserIds } })
      .select('name')
      .lean();
    const reviewUserMap = new Map(
      reviewUsers.map((u: any) => [String(u._id), u.name]),
    );

    const calcInc = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    const l30Stats = l30StatsArr?.[0] || { orders: 0, revenue: 0 };
    const p30Stats = p30StatsArr?.[0] || { orders: 0, revenue: 0 };

    const totalOrdersCount = orderStats?.[0]?.totalOrders || 0;
    const totalRevenueCount = orderStats?.[0]?.revenue || 0;

    const profileViews = merchant?.profileViews || 0;
    const profileViewsIncrease = calcInc(l30Stats.orders, p30Stats.orders); // Proxy based on traffic

    const conversionRate =
      profileViews > 0
        ? Number(((redeemedVouchersCount / profileViews) * 100).toFixed(2))
        : 0;
    // Proxy conversion rate increase based on orders
    const convRateL30 = l30Stats.orders;
    const convRateP30 = p30Stats.orders;
    const conversionRateIncrease = calcInc(convRateL30, convRateP30);

    const result = {
      success: true,
      data: {
        stats: {
          totalOrders: totalOrdersCount,
          revenue: totalRevenueCount,
          totalReviews: reviewStats?.[0]?.totalReviews || 0,
          averageRating: Number(
            (reviewStats?.[0]?.averageRating || 0).toFixed(2),
          ),
          totalViews: adStats?.[0]?.totalViews || 0,
          weeklyViews: adStats?.[0]?.weeklyViews || 0,
          profileViews: profileViews,
          totalRedemptions: redeemedVouchersCount || 0,
          conversionRate: conversionRate,
          activeOffers: activeOffersCount || 0,
          followers: followersCount || 0,
          customers: customersList?.length || 0,
          activeOffersIncrease: calcInc(offersL30, offersP30),
          followersIncrease: calcInc(followsL30, followsP30),
          profileViewsIncrease,
          conversionRateIncrease,
          revenueIncrease: calcInc(l30Stats.revenue, p30Stats.revenue),
        },
        todayActivity: {
          todayOrders: todayOrderStats?.[0]?.todayOrders || 0,
          todayRevenue: todayOrderStats?.[0]?.todayRevenue || 0,
          todayRedemptions: todayRedemptionsCount || 0,
          todayVisitors: todayViewsData?.views || 0,
          todayConversionRate:
            todayClaimsCount > 0
              ? Number(
                  ((todayRedemptionsCount / todayClaimsCount) * 100).toFixed(2),
                )
              : 0,
          todayAvgOrderValue: todayOrderStats?.[0]?.todayOrders
            ? Number(
                (
                  todayOrderStats[0].todayRevenue /
                  todayOrderStats[0].todayOrders
                ).toFixed(2),
              )
            : 0,
        },
        performanceGraph: await this.getRealPerformanceGraph(mId),
        recentOrders: recentOrders.map((o: any) => ({
          _id: String(o._id),
          orderNumber: o.orderNumber,
          amount: o.amount,
          itemsCount: o.itemsCount,
          status: o.status === 'accepted' ? 'completed' : o.status,
          placedAt: o.placedAt,
          customerName: recentOrderUserMap.get(String(o.userId)) || 'Customer',
        })),
        latestReviews: latestReviews.map((r: any) => ({
          _id: String(r._id),
          rating: r.rating,
          content: r.content,
          status: r.status,
          createdAt: r.createdAt,
          userName: reviewUserMap.get(String(r.userId)) || 'Customer',
        })),
        topPerformingOffers: topPerformingOffers.map((o: any) => {
          const stats = offerStatsMap.get(String(o._id)) || {
            claimed: 0,
            redeemed: 0,
            revenue: 0,
          };
          const conversion =
            stats.claimed > 0 ? (stats.redeemed / stats.claimed) * 100 : 0;
          return {
            _id: String(o._id),
            title: o.title,
            productName: o.selectedProducts?.[0]?.productName || 'N/A',
            status:
              o.status === 'under_review' || o.status === 'approved'
                ? 'active'
                : o.status,
            category: o.category,
            imageUrl: o.imageUrl || '/images/default-offer.png',
            redeemed: stats.redeemed,
            revenue: stats.revenue,
            conversion: conversion.toFixed(1),
          };
        }),
      },
    };

    await this.redisService.set(cacheKey, result, 30);
    return result;
  }

  private async getRealPerformanceGraph(merchantId: Types.ObjectId) {
    const now = new Date();

    const yearStart = new Date(now);
    yearStart.setMonth(yearStart.getMonth() - 11);
    yearStart.setDate(1);
    yearStart.setHours(0, 0, 0, 0);

    const orders = await this.orderModel
      .find({
        merchantId,
        placedAt: { $gte: yearStart },
        status: { $in: [OrderStatus.ACCEPTED, OrderStatus.COMPLETED] },
      })
      .select('placedAt amount')
      .lean();

    const vouchers = await this.voucherModel
      .find({
        merchantId,
        status: 'redeemed',
        redeemedAt: { $gte: yearStart },
      })
      .select('redeemedAt')
      .lean();

    const formatData = (type: string, count: number) => {
      const data = [];
      for (let i = count - 1; i >= 0; i--) {
        let label = '';
        let start = new Date();
        let end = new Date();

        if (type === 'weekly') {
          start.setDate(now.getDate() - i);
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setDate(end.getDate() + 1);
          label = start.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          });
        } else if (type === 'monthly') {
          // week buckets
          end.setDate(now.getDate() - i * 7);
          end.setHours(23, 59, 59, 999);
          start = new Date(end);
          start.setDate(start.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          label = `Week ${4 - i}`;
        } else if (type === 'yearly') {
          start.setMonth(now.getMonth() - i);
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setMonth(end.getMonth() + 1);
          label = start.toLocaleDateString('en-GB', { month: 'short' });
        }

        const bucketOrders = orders.filter(
          (o: any) => o.placedAt >= start && o.placedAt < end,
        );
        const bucketVouchers = vouchers.filter(
          (v: any) => v.redeemedAt >= start && v.redeemedAt < end,
        );

        const oCount = bucketOrders.length;
        const rev = bucketOrders.reduce(
          (sum, o: any) => sum + (o.amount || 0),
          0,
        );
        const red = bucketVouchers.length;

        // Proxy conversion rate: redemptions / (orders + redemptions + 1) * 100 for a realistic looking figure
        const conv = oCount + red > 0 ? (red / (oCount + red + 1)) * 100 : 0;

        data.push({
          label,
          orders: oCount,
          revenue: rev,
          redemption: red,
          conversion: Number(conv.toFixed(1)),
        });
      }
      return data;
    };

    return {
      weekly: formatData('weekly', 7),
      monthly: formatData('monthly', 4),
      yearly: formatData('yearly', 12),
    };
  }

  async getMerchantDeviceBreakdown(
    merchantId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const query: any = {
      userId: merchantId,
      'metadata.platform': { $exists: true, $ne: null },
    };
    if (startDate || endDate) {
      query.placedAt = {};
      if (startDate) query.placedAt.$gte = startDate;
      if (endDate) query.placedAt.$lte = endDate;
    }

    let rows = await this.orderModel.aggregate([
      { $match: query },
      { $group: { _id: '$metadata.platform', count: { $sum: 1 } } },
    ]);

    if (!rows.length) {
      rows = await this.adModel.aggregate([
        {
          $match: {
            userId: merchantId,
            'metadata.platform': { $exists: true, $ne: null },
          },
        },
        { $group: { _id: '$metadata.platform', count: { $sum: 1 } } },
      ]);
    }

    return {
      success: true,
      data: this.normalizeDeviceBreakdown(rows),
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantTopRegions(
    merchantId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const merchantObjectId = Types.ObjectId.isValid(merchantId)
      ? new Types.ObjectId(merchantId)
      : null;
    const regionCounts = new Map<string, number>();

    if (merchantObjectId) {
      const query: any = {
        merchantId: merchantObjectId,
        claimLocation: { $exists: true, $ne: '' },
      };
      if (startDate || endDate) {
        query.redeemedAt = {};
        if (startDate) query.redeemedAt.$gte = startDate;
        if (endDate) query.redeemedAt.$lte = endDate;
      }
      const claimRows = await this.voucherModel
        .find(query)
        .select('claimLocation')
        .lean()
        .exec();

      for (const voucher of claimRows as any[]) {
        const label = this.getClaimLocationLabel(voucher?.claimLocation);
        if (!label) continue;
        regionCounts.set(label, (regionCounts.get(label) || 0) + 1);
      }
    }

    const customers = regionCounts.size
      ? []
      : await this.getMerchantCustomerUsers(merchantId);

    for (const customer of customers as any[]) {
      const label = this.getLocationLabel(customer, 'city');
      if (!label) continue;
      regionCounts.set(label, (regionCounts.get(label) || 0) + 1);
    }

    const rows = Array.from(regionCounts.entries())
      .map(([region, count]) => ({ _id: region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const regions = rows.map((row) => ({
      region: row._id,
      count: Number(row.count || 0),
      percent: total ? Math.round((Number(row.count || 0) / total) * 100) : 0,
    }));

    return {
      success: true,
      data: regions,
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantDemographics(
    merchantId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const customers = await this.getMerchantCustomerUsers(merchantId);
    // Note: User demographics are relatively static, but we can filter by the customers active in date range if needed.
    // For now, we will return the demographics of all customers.
    const labels = ['18-24', '25-34', '35-44', '45-64', '65+', 'Unknown'];
    const buckets = new Map(
      labels.map((label) => [
        label,
        { label, maleCount: 0, femaleCount: 0, otherCount: 0, count: 0 },
      ]),
    );

    for (const customer of customers as any[]) {
      const group = this.getAgeGroup(customer?.profile?.dateOfBirth);
      if (!group || !buckets.has(group)) continue;

      const bucket = buckets.get(group);
      const gender = this.normalizeGender(customer?.profile?.gender);
      bucket.count += 1;
      if (gender === 'male') bucket.maleCount += 1;
      else if (gender === 'female') bucket.femaleCount += 1;
      else bucket.otherCount += 1;
    }

    const totalCustomersWithAge = Array.from(buckets.values()).reduce(
      (sum, bucket) => sum + bucket.count,
      0,
    );
    const rows = Array.from(buckets.values()).map((bucket) => ({
      label: bucket.label,
      male: bucket.count
        ? Math.round((bucket.maleCount / bucket.count) * 100)
        : 0,
      female: bucket.count
        ? Math.round((bucket.femaleCount / bucket.count) * 100)
        : 0,
      other: bucket.count
        ? Math.round((bucket.otherCount / bucket.count) * 100)
        : 0,
      count: bucket.count,
      total: totalCustomersWithAge
        ? `${Number(((bucket.count / totalCustomersWithAge) * 100).toFixed(1))}%`
        : '0%',
    }));

    return {
      success: true,
      data: rows,
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantTopProducts(
    merchantId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const query: any = { merchantId };
    // We fetch all active products for the merchant
    query.isActive = true;
    const products = await this.merchantProductModel
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('name category status createdAt views')
      .lean();

    const activeOffers = await this.offerPromotionModel
      .find({ merchantId: merchantId })
      .lean();
    const offerIds = activeOffers.map((o: any) => String(o._id));

    const voucherQuery: any = { offerId: { $in: offerIds } };
    if (startDate || endDate) {
      voucherQuery.createdAt = {};
      if (startDate) voucherQuery.createdAt.$gte = startDate;
      if (endDate) voucherQuery.createdAt.$lte = endDate;
    }
    const offerVouchers = await this.voucherModel
      .find(voucherQuery)
      .select('offerId')
      .lean();

    const offerClaims = new Map();
    for (const v of offerVouchers) {
      const oId = String(v.offerId);
      offerClaims.set(oId, (offerClaims.get(oId) || 0) + 1);
    }

    const productLikes = new Map();
    for (const offer of activeOffers as any[]) {
      const claimed = offerClaims.get(String(offer._id)) || 0;
      const likes = Math.floor(claimed * 1.5) + (offer.title.length % 5);
      if (offer.selectedProducts && offer.selectedProducts.length > 0) {
        for (const prod of offer.selectedProducts) {
          const pId = String(prod.productId);
          productLikes.set(pId, (productLikes.get(pId) || 0) + likes);
        }
      }
    }

    const data = products.map((product: any) => {
      const pId = String(product._id);
      const likes = productLikes.get(pId) || 0;

      return {
        _id: pId,
        name: product.name || 'Untitled Product',
        type: product.category || 'General',
        likes: likes,
        views: product.views || 0,
        status: product.status === 'In Stock' ? 'Active' : 'Inactive',
        createdAt: product.createdAt,
      };
    });

    return {
      success: true,
      data,
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantEventStats(
    merchantId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const mId = new Types.ObjectId(merchantId);

    // Default to last 7 days if no dates provided (for isolated method calls)
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const [totalOrders, uniqueCustomers, allTimeUserOrders] = await Promise.all(
      [
        this.orderModel.countDocuments({
          merchantId: mId,
          placedAt: { $gte: start, $lte: end },
        }),
        this.orderModel.distinct('userId', {
          merchantId: mId,
          placedAt: { $gte: start, $lte: end },
        }),
        this.orderModel.aggregate([
          { $match: { merchantId: mId } },
          {
            $group: {
              _id: '$userId',
              firstOrder: { $min: '$placedAt' },
              totalOrders: { $sum: 1 },
            },
          },
        ]),
      ],
    );

    const activeUserIds = uniqueCustomers.map((id) => String(id));

    let newSignupsCount = 0;
    let returningCount = 0;

    for (const u of allTimeUserOrders) {
      if (activeUserIds.includes(String(u._id))) {
        if (u.totalOrders > 1) {
          returningCount++;
        } else {
          newSignupsCount++;
        }
      }
    }

    const totalActive = activeUserIds.length;
    const retention = totalActive
      ? Math.round((returningCount / totalActive) * 100)
      : 0;

    return {
      success: true,
      data: {
        totalOrders,
        totalActive,
        newSignups: newSignupsCount,
        retention,
        returningCount,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantLoyaltyLeaderboard(merchantId: string) {
    const merchantKey = `merchantLoyaltyPoints.${merchantId}`;

    const users = await this.userModel
      .find({ [merchantKey]: { $exists: true, $gt: 0 } })
      .select('name email merchantLoyaltyPoints')
      .sort({ [merchantKey]: -1 })
      .limit(50)
      .lean();

    return users.map((user: any, index: number) => ({
      name: user.name || user.email || 'Customer',
      email: user.email,
      totalPoints: Number(user.merchantLoyaltyPoints?.[merchantId] || 0),
      offersClaimed: 0,
      rank: index + 1,
    }));
  }

  async getMerchantTrend(merchantId: string, startDate?: Date, endDate?: Date) {
    const mId = new Types.ObjectId(merchantId);

    // Fallback if no dates provided
    const end = endDate || new Date();
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { keys, labels, counts } = this.buildDateRangeBuckets(start, end);

    const rows = await this.orderModel.aggregate([
      {
        $match: {
          merchantId: mId,
          completedAt: { $gte: start, $lte: end },
          status: OrderStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$completedAt',
              timezone: '+05:30',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    for (const row of rows) {
      if (counts.has(row._id)) {
        counts.set(row._id, Number(row.count || 0));
      }
    }

    return {
      success: true,
      data: {
        labels,
        values: keys.map((key) => counts.get(key) || 0),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async getRealtimeAnalytics(merchantId: string, start?: string, end?: string) {
    const cacheKey = `analytics:realtime:${merchantId}:${start || 'all'}:${end || 'all'}`;
    const cached = (await this.redisService.get(cacheKey)) as any;
    if (cached) return cached;

    const endDate = end ? new Date(end) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = start ? new Date(start) : new Date();
    if (!start) startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    let [device, regions, products, events, trend, demographics, summary] =
      await Promise.all([
        this.getMerchantDeviceBreakdown(merchantId, startDate, endDate),
        this.getMerchantTopRegions(merchantId, startDate, endDate),
        this.getMerchantTopProducts(merchantId, startDate, endDate),
        this.getMerchantEventStats(merchantId, startDate, endDate),
        this.getMerchantTrend(merchantId, startDate, endDate),
        this.getMerchantDemographics(merchantId, startDate, endDate),
        this.getSummary(merchantId, startDate, endDate),
      ]);

    const merchantDoc = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (merchantDoc) {
      const planDetails =
        await this.SubscriptionsService.getPlanDetails(merchantDoc);
      if (!planDetails.planFeatures.canViewAdvancedAnalytics) {
        device.data = { Mobile: 0, Desktop: 0, Tablet: 0 };
        demographics.data = [];
      }
    }

    const redemptions = await this.getRedemptionTrend(merchantId, 'weekly');

    const offerQuery: any = { merchantId: merchantId };
    if (start || end) {
      if (start) offerQuery.endDate = { $gte: startDate };
      if (end) offerQuery.startDate = { $lte: endDate };
    }
    const topOffers = await this.offerPromotionModel
      .find(offerQuery)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const displayOffers = topOffers;

    const offerIds = topOffers.map((o: any) => String(o._id));

    const voucherQuery: any = { offerId: { $in: offerIds } };
    if (start || end) {
      voucherQuery.createdAt = {};
      if (start) voucherQuery.createdAt.$gte = startDate;
      if (end) voucherQuery.createdAt.$lte = endDate;
    }
    const offerVouchers = await this.voucherModel
      .find(voucherQuery)
      .select('offerId status createdAt redeemedAt')
      .lean();

    const likeQuery: any = { offerPublicId: { $in: offerIds } };
    if (start || end) {
      likeQuery.createdAt = {};
      if (start) likeQuery.createdAt.$gte = startDate;
      if (end) likeQuery.createdAt.$lte = endDate;
    }
    const offerLikes = await this.offerLikeHistoryModel
      .find(likeQuery)
      .select('offerPublicId createdAt')
      .lean();

    const offerStats = new Map();
    for (const offer of displayOffers) {
      offerStats.set(String(offer._id), {
        claimed: 0,
        redeemed: 0,
        liked: 0,
        claimedTrend: {
          weekly: new Array(7).fill(0),
          monthly: new Array(4).fill(0),
          yearly: new Array(12).fill(0),
        },
        redeemedTrend: {
          weekly: new Array(7).fill(0),
          monthly: new Array(4).fill(0),
          yearly: new Array(12).fill(0),
        },
        likedTrend: {
          weekly: new Array(7).fill(0),
          monthly: new Array(4).fill(0),
          yearly: new Array(12).fill(0),
        },
      });
    }

    const now = new Date();

    for (const v of offerVouchers) {
      const oId = String(v.offerId);
      if (!offerStats.has(oId)) continue;
      const stats = offerStats.get(oId);
      stats.claimed += 1;

      if ((v as any).createdAt) {
        const date = new Date((v as any).createdAt);

        // Yearly (Jan-Dec)
        if (date.getFullYear() === now.getFullYear()) {
          stats.claimedTrend.yearly[date.getMonth()] += 1;
        }

        // Monthly (Wk 1 - Wk 4)
        if (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth()
        ) {
          const weekIdx = Math.min(3, Math.floor((date.getDate() - 1) / 7));
          stats.claimedTrend.monthly[weekIdx] += 1;
        }

        // Weekly (Mon-Sun of current week)
        const nowMonday = new Date(now);
        const currentDayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
        nowMonday.setDate(now.getDate() - currentDayOfWeek);
        nowMonday.setHours(0, 0, 0, 0);

        if (date >= nowMonday) {
          const dateDayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
          stats.claimedTrend.weekly[dateDayIndex] += 1;
        }
      }

      if (v.status === 'redeemed') {
        stats.redeemed += 1;
        if (v.redeemedAt) {
          const date = new Date(v.redeemedAt);

          if (date.getFullYear() === now.getFullYear()) {
            stats.redeemedTrend.yearly[date.getMonth()] += 1;
          }

          if (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
          ) {
            const weekIdx = Math.min(3, Math.floor((date.getDate() - 1) / 7));
            stats.redeemedTrend.monthly[weekIdx] += 1;
          }

          const nowMonday = new Date(now);
          const currentDayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
          nowMonday.setDate(now.getDate() - currentDayOfWeek);
          nowMonday.setHours(0, 0, 0, 0);

          if (date >= nowMonday) {
            const dateDayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
            stats.redeemedTrend.weekly[dateDayIndex] += 1;
          }
        }
      }
    }

    for (const like of offerLikes) {
      const oId = String((like as any).offerPublicId);
      if (!offerStats.has(oId)) continue;
      const stats = offerStats.get(oId);
      stats.liked += 1;

      if ((like as any).createdAt) {
        const date = new Date((like as any).createdAt);

        // Yearly (Jan-Dec)
        if (date.getFullYear() === now.getFullYear()) {
          stats.likedTrend.yearly[date.getMonth()] += 1;
        }

        // Monthly (Wk 1 - Wk 4)
        if (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth()
        ) {
          const weekIdx = Math.min(3, Math.floor((date.getDate() - 1) / 7));
          stats.likedTrend.monthly[weekIdx] += 1;
        }

        // Weekly (Mon-Sun of current week)
        const nowMonday = new Date(now);
        const currentDayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
        nowMonday.setDate(now.getDate() - currentDayOfWeek);
        nowMonday.setHours(0, 0, 0, 0);

        if (date >= nowMonday) {
          const dateDayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
          stats.likedTrend.weekly[dateDayIndex] += 1;
        }
      }
    }

    const offersPerformance = displayOffers.map((offer, idx) => {
      const stats = offerStats.get(String(offer._id));
      const claimed = stats.claimed;
      const redeemed = stats.redeemed;
      const liked = stats.liked;

      const claimedTrend = stats.claimedTrend;
      const redeemedTrend = stats.redeemedTrend;
      const likedTrend = stats.likedTrend;

      return {
        _id: String(offer._id),
        requestId: offer.requestId || String(offer._id),
        title: offer.title,
        productName: offer.selectedProducts?.[0]?.productName || 'N/A',
        type: offer.category || offer.promoTag || 'Standard',
        createdAt: offer.createdAt,
        liked: { total: liked, trend: likedTrend },
        claimed: { total: claimed, trend: claimedTrend },
        redeemed: { total: redeemed, trend: redeemedTrend },
      };
    });

    const mIdObj = Types.ObjectId.isValid(merchantId)
      ? new Types.ObjectId(merchantId)
      : null;
    let retentionList = [];
    if (mIdObj) {
      const orderQuery: any = { merchantId: mIdObj };
      if (start || end) {
        orderQuery.placedAt = {};
        if (start) orderQuery.placedAt.$gte = startDate;
        if (end) orderQuery.placedAt.$lte = endDate;
      }
      const customerStats = await this.orderModel.aggregate([
        { $match: orderQuery },
        {
          $group: {
            _id: '$userId',
            orders: { $sum: 1 },
            totalSpent: { $sum: '$amount' },
            firstVisit: { $min: '$placedAt' },
            lastVisit: { $max: '$placedAt' },
          },
        },
        { $sort: { lastVisit: -1 } },
        { $limit: 50 },
      ]);

      const userIds = customerStats.map((s: any) => s._id).filter(Boolean);
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('name')
        .lean();
      const userMap = new Map(
        users.map((u: any) => [String(u._id), u.name || 'Anonymous']),
      );

      // Fetch lifetime stats for these specific users to correctly determine "Returning" vs "New"
      const lifetimeStats = await this.orderModel.aggregate([
        { $match: { merchantId: mIdObj, userId: { $in: userIds } } },
        {
          $group: {
            _id: '$userId',
            totalOrders: { $sum: 1 },
            lifetimeFirstVisit: { $min: '$placedAt' },
          },
        },
      ]);
      const lifetimeMap = new Map(
        lifetimeStats.map((s: any) => [
          String(s._id),
          { totalOrders: s.totalOrders, firstVisit: s.lifetimeFirstVisit },
        ]),
      );

      const nowTime = new Date().getTime();

      retentionList = customerStats.map((s: any, idx) => {
        const uId = String(s._id);
        const lifetime = lifetimeMap.get(uId) || {
          totalOrders: s.orders,
          firstVisit: s.firstVisit,
        };
        const isNew =
          lifetime.firstVisit &&
          nowTime - new Date(lifetime.firstVisit).getTime() <
            7 * 24 * 60 * 60 * 1000;

        // Unify logic: Returning = >1 lifetime orders. If 1 order but it's old, mark At Risk.
        const status =
          lifetime.totalOrders > 1 ? 'Returning' : isNew ? 'New' : 'At Risk';

        return {
          id: idx + 1,
          cId: 'CUST' + uId.substring(uId.length - 6).toUpperCase(),
          name: userMap.get(uId) || 'Anonymous',
          firstVisit: lifetime.firstVisit, // Use lifetime first visit instead of period first visit
          lastVisit: s.lastVisit,
          orders: lifetime.totalOrders, // Show lifetime orders in the table to avoid confusion
          totalSpent: s.totalSpent,
          status,
        };
      });
    }

    const result = {
      success: true,
      data: {
        device: device.data,
        regions: regions.data,
        products: products.data,
        events: events.data,
        trend: trend.data,
        demographics: demographics.data,
        redemptions,
        offersPerformance,
        retentionList,
        summary: summary.data,
      },
      updatedAt: new Date().toISOString(),
    };

    await this.redisService.set(cacheKey, result, 30); // 30 seconds TTL as requested

    return result;
  }
}

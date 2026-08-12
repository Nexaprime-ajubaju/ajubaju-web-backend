import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ad, AdDocument } from '../ads/schemas/category-schemas/ad.schema';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
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

@Injectable()
export class MerchantDashboardService {
  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Voucher.name)
    private readonly voucherModel: Model<VoucherDocument>,
    @InjectModel(OfferLikeHistory.name)
    private readonly offerLikeHistoryModel: Model<OfferLikeHistoryDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    private readonly redisService: RedisService,
    private readonly SubscriptionsService: SubscriptionsService,
  ) {}

  private buildDateBuckets(days: number) {
    const now = new Date();
    const labels: string[] = [];
    const keys: string[] = [];
    const counts = new Map<string, number>();

    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      keys.push(key);
      labels.push(
        d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      );
      counts.set(key, 0);
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
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) return null;

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
                  $dateToString: { format: '%Y-%m-%d', date: '$redeemedAt', timezone: '+05:30' },
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

  async getSummary(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [recentOrders, latestReviews, orderStats, reviewStats, adStats, merchant, redeemedVouchersCount] =
      await Promise.all([
        this.orderModel
          .find({ merchantId: mId })
          .sort({ placedAt: -1 })
          .limit(5)
          .lean(),
        this.reviewModel
          .find({ merchantId: mId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        this.orderModel.aggregate([
          { $match: { merchantId: mId } },
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
          { $match: { merchantId: mId } },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating' },
              totalReviews: { $sum: 1 },
            },
          },
        ]),
        this.adModel.aggregate([
          { $match: { userId: merchantId } },
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
        this.merchantModel.findOne({ userId: merchantId }).select('profileViews').lean(),
        this.voucherModel.countDocuments({ merchantId: mId, status: 'redeemed' }),
      ]);

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

    return {
      success: true,
      data: {
        stats: {
          totalOrders: orderStats?.[0]?.totalOrders || 0,
          revenue: orderStats?.[0]?.revenue || 0,
          totalReviews: reviewStats?.[0]?.totalReviews || 0,
          averageRating: Number(
            (reviewStats?.[0]?.averageRating || 0).toFixed(2),
          ),
          totalViews: adStats?.[0]?.totalViews || 0,
          weeklyViews: adStats?.[0]?.weeklyViews || 0,
          profileViews: merchant?.profileViews || 0,
          totalRedemptions: redeemedVouchersCount || 0,
          conversionRate: merchant?.profileViews > 0 
            ? Number(((redeemedVouchersCount / merchant.profileViews) * 100).toFixed(2)) 
            : 0,
        },
        recentOrders: recentOrders.map((o: any) => ({
          _id: String(o._id),
          orderNumber: o.orderNumber,
          amount: o.amount,
          itemsCount: o.itemsCount,
          status: o.status,
          placedAt: o.placedAt,
        })),
        latestReviews: latestReviews.map((r: any) => ({
          _id: String(r._id),
          rating: r.rating,
          content: r.content,
          status: r.status,
          createdAt: r.createdAt,
          userName: reviewUserMap.get(String(r.userId)) || 'Customer',
        })),
      },
    };
  }

  async getMerchantDeviceBreakdown(merchantId: string) {
    const customers = await this.getMerchantCustomerUsers(merchantId);
    const customerDeviceCounts = new Map<string, number>();

    for (const customer of customers as any[]) {
      const platform =
        customer?.metadata?.platform ||
        this.getPlatformFromUserAgent(customer?.metadata?.userAgent);
      if (!platform || platform === 'Unknown') continue;
      customerDeviceCounts.set(
        platform,
        (customerDeviceCounts.get(platform) || 0) + 1,
      );
    }

    let rows = Array.from(customerDeviceCounts.entries()).map(
      ([platform, count]) => ({ _id: platform, count }),
    );

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

  async getMerchantTopRegions(merchantId: string) {
    const merchantObjectId = Types.ObjectId.isValid(merchantId)
      ? new Types.ObjectId(merchantId)
      : null;
    const regionCounts = new Map<string, number>();

    if (merchantObjectId) {
      const claimRows = await this.voucherModel
        .find({
          merchantId: merchantObjectId,
          claimLocation: { $exists: true, $ne: '' },
        })
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

  async getMerchantDemographics(merchantId: string) {
    const customers = await this.getMerchantCustomerUsers(merchantId);
    const labels = ['18-24', '25-34', '35-44', '45-64', '65+'];
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

  async getMerchantTopProducts(merchantId: string) {
    const products = await this.productModel
      .find({ merchantId, isVisible: true })
      .sort({ purchases: -1, views: -1, updatedAt: -1 })
      .limit(5)
      .select('productName category purchases views')
      .lean();

    const data = products.map((product: any) => ({
      name: product.productName || 'Untitled Product',
      type: product.category || 'General',
      likes: Number(product.purchases || 0),
      views: Number(product.views || 0),
    }));

    return {
      success: true,
      data,
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantEventStats(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const since7d = new Date();
    since7d.setDate(since7d.getDate() - 7);

    const [totalOrders, uniqueCustomers, newCustomers, repeatCustomers] =
      await Promise.all([
        this.orderModel.countDocuments({ merchantId: mId }),
        this.orderModel.distinct('userId', { merchantId: mId }),
        this.orderModel.distinct('userId', {
          merchantId: mId,
          placedAt: { $gte: since7d },
        }),
        this.orderModel.aggregate([
          { $match: { merchantId: mId } },
          { $group: { _id: '$userId', orders: { $sum: 1 } } },
          { $match: { orders: { $gt: 1 } } },
          { $count: 'count' },
        ]),
      ]);

    const totalActive = Number(uniqueCustomers?.length || 0);
    const newSignups = Number(newCustomers?.length || 0);
    const retention = totalActive
      ? Math.round(((repeatCustomers?.[0]?.count || 0) / totalActive) * 100)
      : 0;

    return {
      success: true,
      data: {
        totalOrders,
        totalActive,
        newSignups,
        retention,
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

  async getMerchantTrend(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const { keys, labels, counts } = this.buildDateBuckets(7);
    const start = new Date(keys[0]);

    const rows = await this.orderModel.aggregate([
      { $match: { merchantId: mId, completedAt: { $gte: start }, status: OrderStatus.COMPLETED } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: '+05:30' },
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

  async getRealtimeAnalytics(merchantId: string) {
    let [device, regions, products, events, trend, demographics] =
      await Promise.all([
        this.getMerchantDeviceBreakdown(merchantId),
        this.getMerchantTopRegions(merchantId),
        this.getMerchantTopProducts(merchantId),
        this.getMerchantEventStats(merchantId),
        this.getMerchantTrend(merchantId),
        this.getMerchantDemographics(merchantId),
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

    return {
      success: true,
      data: {
        device: device.data,
        regions: regions.data,
        products: products.data,
        events: events.data,
        trend: trend.data,
        demographics: demographics.data,
        redemptions,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}

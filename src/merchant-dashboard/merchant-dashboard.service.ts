import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ad, AdDocument } from '../ads/schemas/category-schemas/ad.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class MerchantDashboardService {
  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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
      const key = d.toISOString().slice(0, 10);
      keys.push(key);
      labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      counts.set(key, 0);
    }

    return { keys, labels, counts };
  }

  private normalizeDeviceBreakdown(deviceCounts: Array<{ _id: string; count: number }>) {
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
      } else if (platform.includes('desktop') || platform.includes('mac') || platform.includes('windows') || platform.includes('linux')) {
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
      Tablet: Math.max(0, 100 - Math.round((normalized.Mobile / total) * 100) - Math.round((normalized.Desktop / total) * 100)),
    };
  }

  async getSummary(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [recentOrders, latestReviews, orderStats, reviewStats, adStats] = await Promise.all([
      this.orderModel.find({ merchantId: mId }).sort({ placedAt: -1 }).limit(5).lean(),
      this.reviewModel.find({ merchantId: mId }).sort({ createdAt: -1 }).limit(5).lean(),
      this.orderModel.aggregate([
        { $match: { merchantId: mId } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $in: ['$status', [OrderStatus.ACCEPTED, OrderStatus.COMPLETED]] }, '$amount', 0],
              },
            },
          },
        },
      ]),
      this.reviewModel.aggregate([
        { $match: { merchantId: mId } },
        { $group: { _id: null, averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
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
    ]);

    const reviewUserIds = latestReviews.map((r: any) => r.userId).filter(Boolean);
    const reviewUsers = await this.userModel.find({ _id: { $in: reviewUserIds } }).select('name').lean();
    const reviewUserMap = new Map(reviewUsers.map((u: any) => [String(u._id), u.name]));

    return {
      success: true,
      data: {
        stats: {
          totalOrders: orderStats?.[0]?.totalOrders || 0,
          revenue: orderStats?.[0]?.revenue || 0,
          totalReviews: reviewStats?.[0]?.totalReviews || 0,
          averageRating: Number((reviewStats?.[0]?.averageRating || 0).toFixed(2)),
          totalViews: adStats?.[0]?.totalViews || 0,
          weeklyViews: adStats?.[0]?.weeklyViews || 0,
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
    const rows = await this.adModel.aggregate([
      { $match: { userId: merchantId, 'metadata.platform': { $exists: true, $ne: null } } },
      { $group: { _id: '$metadata.platform', count: { $sum: 1 } } },
    ]);

    return {
      success: true,
      data: this.normalizeDeviceBreakdown(rows),
      updatedAt: new Date().toISOString(),
    };
  }

  async getMerchantTopRegions(merchantId: string) {
    const rows = await this.adModel.aggregate([
      { $match: { userId: merchantId, city: { $exists: true, $ne: '' } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 as 1 | -1 } },
      { $limit: 5 },
    ]);

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

    const [totalOrders, uniqueCustomers, newCustomers, repeatCustomers] = await Promise.all([
      this.orderModel.countDocuments({ merchantId: mId }),
      this.orderModel.distinct('userId', { merchantId: mId }),
      this.orderModel.distinct('userId', { merchantId: mId, placedAt: { $gte: since7d } }),
      this.orderModel.aggregate([
        { $match: { merchantId: mId } },
        { $group: { _id: '$userId', orders: { $sum: 1 } } },
        { $match: { orders: { $gt: 1 } } },
        { $count: 'count' },
      ]),
    ]);

    const totalActive = Number(uniqueCustomers?.length || 0);
    const newSignups = Number(newCustomers?.length || 0);
    const retention = totalActive ? Math.round(((repeatCustomers?.[0]?.count || 0) / totalActive) * 100) : 0;

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
      { $match: { merchantId: mId, placedAt: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$placedAt' },
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
    const [device, regions, products, events, trend] = await Promise.all([
      this.getMerchantDeviceBreakdown(merchantId),
      this.getMerchantTopRegions(merchantId),
      this.getMerchantTopProducts(merchantId),
      this.getMerchantEventStats(merchantId),
      this.getMerchantTrend(merchantId),
    ]);

    return {
      success: true,
      data: {
        device: device.data,
        regions: regions.data,
        products: products.data,
        events: events.data,
        trend: trend.data,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ad, AdDocument } from '../ads/schemas/category-schemas/ad.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Ad.name) private adModel: Model<AdDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
  ) {}

  async getDeviceBreakdown() {
    // Aggregate device info from ads metadata
    const pipeline = [
      { $match: { 'metadata.deviceId': { $exists: true, $ne: null } } },
      { $group: { _id: '$metadata.platform', count: { $sum: 1 } } },
    ];
    const result = await this.adModel.aggregate(pipeline);
    // Map to Desktop/Mobile/Tablet if possible
    const breakdown = { Desktop: 0, Mobile: 0, Tablet: 0 };
    let total = 0;
    for (const r of result) {
      if (!r._id) continue;
      if (/desktop/i.test(r._id)) breakdown.Desktop += r.count;
      else if (/mobile/i.test(r._id)) breakdown.Mobile += r.count;
      else if (/tablet/i.test(r._id)) breakdown.Tablet += r.count;
      total += r.count;
    }
    // Calculate percentages
    Object.keys(breakdown).forEach((k) => {
      breakdown[k] = total ? Math.round((breakdown[k] / total) * 100) : 0;
    });
    return breakdown;
  }

  async getTopRegions() {
    // Aggregate by city/state
    const pipeline = [
      { $match: { city: { $exists: true, $ne: null } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: { $meta: undefined, $numberInt: '-1' } as any } },
      { $limit: 5 },
    ];
    // Fix: Use correct $sort type for Mongoose PipelineStage
    pipeline[2] = { $sort: { count: -1 as 1 | -1 } };
    const result = await this.adModel.aggregate(pipeline);
    const total = result.reduce((sum, r) => sum + r.count, 0);
    return result.map((r) => ({
      region: r._id,
      count: r.count,
      percent: total ? Math.round((r.count / total) * 100) : 0,
    }));
  }

  async getTopPages() {
    // Example: Use ad views as proxy for top pages
    const pipeline = [
      { $match: { views: { $gt: 0 } } },
      { $project: { page: { $concat: ['/product/', '$adId'] }, views: 1 } },
      { $sort: { views: -1 as 1 | -1 } },
      { $limit: 5 },
    ];
    const result = await this.adModel.aggregate(pipeline);
    const total = result.reduce((sum, r) => sum + r.views, 0);
    return result.map((r) => ({
      page: r.page,
      count: r.views,
      percent: total ? Math.round((r.views / total) * 100) : 0,
    }));
  }

  async getEvents() {
    // Registrations, logins, listings posted, transactions
    const [registrations, listings, transactions] = await Promise.all([
      this.userModel.countDocuments(),
      this.adModel.countDocuments(),
      this.paymentModel.countDocuments({
        status: { $in: ['CAPTURED', 'AUTHORIZED', 'PARTIALLY_REFUNDED'] },
      }),
    ]);
    // Logins would require an audit log or session collection
    return {
      registrations,
      listingsPosted: listings,
      transactions,
      logins: 0, // Placeholder unless you have a login log
    };
  }

  async getRecentActivity() {
    // Recent ads, users, payments
    const [recentUsers, recentAds, recentPayments] = await Promise.all([
      this.userModel.find().sort({ createdAt: -1 }).limit(5).lean(),
      this.adModel.find().sort({ createdAt: -1 }).limit(5).lean(),
      this.paymentModel.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    return {
      users: recentUsers.map((u) => ({
        type: 'user',
        name: u.name,
        createdAt: u.createdAt,
      })),
      ads: recentAds.map((a) => ({
        type: 'ad',
        title: a.title,
        createdAt: a.createdAt,
      })),
      payments: recentPayments.map((p) => ({
        type: 'payment',
        amount: p.amount,
        createdAt: p.createdAt,
      })),
    };
  }
}

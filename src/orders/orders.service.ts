import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import {
  Notification,
  NotificationDocument,
} from '../users/schemas/notification.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TransactionService } from '../common/services/transaction.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Merchant.name)
    private readonly merchantModel: Model<MerchantDocument>,
    private readonly SubscriptionsService: SubscriptionsService,
    private readonly transactionService: TransactionService,
  ) { }

  private async sendPushNotificationToMerchant(
    merchantId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const merchant = await this.merchantModel
        .findOne({ userId: String(merchantId) })
        .select('notificationSettings pushTokens')
        .lean()
        .exec();

      const pushEnabled = merchant?.notificationSettings?.pushNotifications !== false;
      const pushTokens = Array.isArray((merchant as any)?.pushTokens)
        ? (merchant as any).pushTokens.filter(Boolean)
        : [];

      if (!pushEnabled || !pushTokens.length) {
        return;
      }

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: pushTokens,
          title,
          body,
          sound: 'default',
          ttl: 2419200,
          priority: 'high',
          data: { type: 'notification', ...(data || {}) },
        }),
      });
    } catch (error: any) {
      this.logger.warn(`Failed to send push notification to merchant ${merchantId}: ${error?.message || 'unknown error'}`);
    }
  }

  private async sendPushNotificationToCustomer(
    customerId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const customer = await this.userModel
        .findById(String(customerId))
        .select('pushTokens')
        .lean()
        .exec();

      const pushTokens = Array.isArray((customer as any)?.pushTokens)
        ? (customer as any).pushTokens.filter(Boolean)
        : [];

      if (!pushTokens.length) {
        return;
      }

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: pushTokens,
          title,
          body,
          sound: 'default',
          ttl: 2419200,
          priority: 'high',
          data: { type: 'notification', ...(data || {}) },
        }),
      });
    } catch (error: any) {
      this.logger.warn(`Failed to send push notification to customer ${customerId}: ${error?.message || 'unknown error'}`);
    }
  }

  async createOrder(
    userId: string,
    merchantId: string,
    amount: number,
    itemsCount = 1,
    voucherId?: string,
    session?: ClientSession,
  ) {
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const order = await this.transactionService.execute(async (txSession) => {
      const createdOrder = new this.orderModel({
        userId: new Types.ObjectId(userId),
        merchantId: new Types.ObjectId(merchantId),
        orderNumber,
        amount,
        itemsCount,
        status: OrderStatus.PENDING,
        placedAt: new Date(),
        voucherId,
      });

      await createdOrder.save({ session: txSession });

      try {
        const merchant = await this.userModel
          .findById(merchantId)
          .select('name email')
          .session(txSession)
          .lean()
          .exec();
        const customer = await this.userModel
          .findById(userId)
          .select('name')
          .session(txSession)
          .lean()
          .exec();

        if (merchant && customer) {
          const notifications = await this.notificationModel.create(
            [
              {
                recipientId: String(merchantId),
                senderId: String(userId),
                senderName: customer.name || 'Customer',
                adId: createdOrder.voucherId || 'order',
                adTitle: `New order from ${customer.name || 'Customer'}`,
                type: 'order_placed',
                message: `${customer.name || 'Customer'} claimed your offer`,
                read: false,
              },
            ],
            { session: txSession },
          );

          await this.sendPushNotificationToMerchant(
            String(merchantId),
            'New order',
            `${customer.name || 'Customer'} claimed your offer`,
            { notificationId: String(notifications[0]._id), adId: createdOrder.voucherId || 'order', type: 'order_placed' },
          );

          this.logger.log(
            `Notification created for merchant ${merchantId} for order ${createdOrder.orderNumber}`,
          );
        }
      } catch (notifError: any) {
        this.logger.error(
          `Failed to create notification: ${notifError.message}`,
        );
      }

      return createdOrder;
    }, session);

    return {
      success: true,
      message: 'Order placed successfully',
      data: {
        _id: String(order._id),
        orderNumber: order.orderNumber,
        amount: order.amount,
        itemsCount: order.itemsCount,
        status: order.status,
        placedAt: order.placedAt,
        voucherId: order.voucherId,
      },
    };
  }

  async getMerchantOrders(
    merchantId: string,
    page = 1,
    limit = 20,
    status?: string,
  ) {
    const query: any = { merchantId: new Types.ObjectId(merchantId) };
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ placedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);

    const userIds = orders.map((o) => o.userId).filter(Boolean);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('name profile.phone profile.avatar profilePhoto')
      .lean();
    const userMapName = new Map(users.map((u: any) => [String(u._id), u.name]));
    const userMapPhone = new Map(
      users.map((u: any) => [
        String(u._id),
        (u.profile && u.profile.phone) || null,
      ]),
    );
    const userMapAvatar = new Map(
      users.map((u: any) => {
        let avatar = (u.profile && u.profile.avatar) || u.profilePhoto || null;
        if (avatar && avatar.length > 1000 && avatar.startsWith('data:image')) {
          avatar = null; // Drop huge base64 strings
        }
        return [String(u._id), avatar];
      }),
    );

    return {
      success: true,
      data: orders.map((o: any) => ({
        _id: String(o._id),
        orderNumber: o.orderNumber,
        amount: o.amount,
        itemsCount: o.itemsCount,
        status: o.status,
        placedAt: o.placedAt,
        customerName: userMapName.get(String(o.userId)) || 'Unknown Customer',
        customerPhone: userMapPhone.get(String(o.userId)) || null,
        customerAvatar: userMapAvatar.get(String(o.userId)) || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantOrderStats(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayOrders, pendingOrders, completedOrders, rejectedOrders, totalOrders, revenueAgg] =
      await Promise.all([
        this.orderModel.countDocuments({
          merchantId: mId,
          placedAt: { $gte: startOfDay },
        }),
        this.orderModel.countDocuments({
          merchantId: mId,
          status: OrderStatus.PENDING,
        }),
        this.orderModel.countDocuments({
          merchantId: mId,
          status: OrderStatus.COMPLETED,
        }),
        this.orderModel.countDocuments({
          merchantId: mId,
          status: OrderStatus.REJECTED,
        }),
        this.orderModel.countDocuments({
          merchantId: mId,
        }),
        this.orderModel.aggregate([
          {
            $match: {
              merchantId: mId,
              status: { $in: [OrderStatus.ACCEPTED, OrderStatus.COMPLETED] },
            },
          },
          { $group: { _id: null, totalRevenue: { $sum: '$amount' } } },
        ]),
      ]);

    const totalRevenue = revenueAgg?.[0]?.totalRevenue || 0;

    return {
      success: true,
      data: {
        todayOrders,
        pendingOrders,
        completedOrders,
        rejectedOrders,
        totalOrders,
        totalRevenue,
      },
    };
  }

  async updateOrderStatus(
    merchantId: string,
    orderId: string,
    status: OrderStatus,
  ) {
    if (!Object.values(OrderStatus).includes(status)) {
      throw new BadRequestException('Invalid order status');
    }

    const merchant = await this.merchantModel
      .findOne({ userId: merchantId })
      .exec();
    if (merchant) {
      const planDetails =
        await this.SubscriptionsService.getPlanDetails(merchant);
      const allowedStatuses = planDetails.planFeatures.ordersStatusAllowed;
      // Always allow accepting or rejecting offers regardless of the subscription plan
      if (
        !allowedStatuses.includes(status) &&
        status !== OrderStatus.ACCEPTED &&
        status !== OrderStatus.REJECTED
      ) {
        throw new ForbiddenException({
          success: false,
          statusCode: 403,
          errorCode: 'PLAN_RESTRICTION',
          message: `${planDetails.name} merchants can only change order status to: ${allowedStatuses.join(', ')}. Please upgrade to a higher plan.`,
        });
      }
    }

    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      merchantId: new Types.ObjectId(merchantId),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.status = status;
    if (status === OrderStatus.ACCEPTED) {
      order.acceptedAt = new Date();
    }
    if (status === OrderStatus.COMPLETED) {
      order.completedAt = new Date();
    }

    await order.save();

    // Create notification for the customer
    try {
      const merchant = await this.userModel
        .findById(merchantId)
        .select('name')
        .lean()
        .exec();
      const customerId = String(order.userId);
      const merchantName = merchant?.name || 'Merchant';

      if (status === OrderStatus.ACCEPTED) {
        const notification = await this.notificationModel.create({
          recipientId: customerId,
          senderId: String(merchantId),
          senderName: merchantName,
          adId: order.voucherId || 'order',
          adTitle: `${merchantName} accepted your offer`,
          type: 'order_accepted',
          message: `${merchantName} accepted your claimed offer`,
          read: false,
        });
        await this.sendPushNotificationToCustomer(customerId, 'Offer accepted', `${merchantName} accepted your claimed offer`, {
          notificationId: String(notification._id),
          type: 'order_accepted',
        });
      } else if (status === OrderStatus.REJECTED) {
        const notification = await this.notificationModel.create({
          recipientId: customerId,
          senderId: String(merchantId),
          senderName: merchantName,
          adId: order.voucherId || 'order',
          adTitle: `${merchantName} rejected your offer`,
          type: 'order_rejected',
          message: `${merchantName} rejected your claimed offer`,
          read: false,
        });
        await this.sendPushNotificationToCustomer(customerId, 'Offer update', `${merchantName} rejected your claimed offer`, {
          notificationId: String(notification._id),
          type: 'order_rejected',
        });
      }
    } catch (notifError) {
      this.logger.error(
        `Failed to create status update notification: ${notifError.message}`,
      );
    }

    return {
      success: true,
      message: 'Order status updated',
      data: {
        _id: String(order._id),
        status: order.status,
      },
    };
  }
}
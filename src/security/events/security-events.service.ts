import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SecurityEvent,
  SecurityEventDocument,
  SecurityEventType,
} from '../schemas/security-event.schema';
import { User, UserDocument, UserRole } from '../../users/schemas/user.schema';
import {
  Notification,
  NotificationDocument,
} from '../../users/schemas/notification.schema';

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(
    @InjectModel(SecurityEvent.name)
    private readonly securityEventModel: Model<SecurityEventDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async logEvent(params: {
    merchantId: string;
    offerId?: string;
    eventType: SecurityEventType;
    severity: string;
    message: string;
    metadata?: any;
  }) {
    try {
      this.logger.warn(
        `Security Event [${params.eventType}]: ${params.message}`,
      );
      await this.securityEventModel.create(params);

      // Notify admins if a merchant is restricted
      if (params.eventType === SecurityEventType.MERCHANT_RESTRICTED) {
        const admins = await this.userModel
          .find({ role: UserRole.ADMIN })
          .select('_id')
          .exec();
        const adminIds = admins.map((admin) => admin._id.toString());

        if (adminIds.length > 0) {
          const notifications = adminIds.map((adminId) => ({
            recipientId: adminId,
            title: 'Merchant Restricted',
            message: `Merchant ${params.merchantId} has been restricted: ${params.message}`,
            type: 'admin_warning',
            data: {
              merchantId: params.merchantId,
              eventType: params.eventType,
              metadata: params.metadata,
            },
          }));

          await this.notificationModel.insertMany(notifications);
          this.logger.log(
            `Created ${notifications.length} admin notifications for merchant restriction`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }
}

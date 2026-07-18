import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecurityEventsService } from './events/security-events.service';
import { ModerationSecurityService } from './moderation/moderation-security.service';
import { SecurityEvent, SecurityEventSchema } from './schemas/security-event.schema';
import { MerchantModerationAttempt, MerchantModerationAttemptSchema } from './schemas/merchant-moderation-attempt.schema';
import { Merchant, MerchantSchema } from '../users/schemas/merchant.schema';
import { OfferPromotion, OfferPromotionSchema } from '../offers/schemas/offer-promotion.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Notification, NotificationSchema } from '../users/schemas/notification.schema';
import { SecurityAdminController } from './security-admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityEvent.name, schema: SecurityEventSchema },
      { name: MerchantModerationAttempt.name, schema: MerchantModerationAttemptSchema },
      { name: Merchant.name, schema: MerchantSchema },
      { name: OfferPromotion.name, schema: OfferPromotionSchema },
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [SecurityAdminController],
  providers: [SecurityEventsService, ModerationSecurityService],
  exports: [ModerationSecurityService, SecurityEventsService],
})
export class SecurityModule {}

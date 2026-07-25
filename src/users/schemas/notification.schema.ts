import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  recipientId: string; // ad owner who receives the notification

  @Prop({ required: false })
  senderId?: string; // user who wishlisted, followed, etc.

  @Prop({ required: false })
  senderName?: string;

  @Prop({ required: false })
  adId?: string;

  @Prop({ required: false })
  adTitle?: string;

  @Prop({ required: false })
  merchantId?: string;

  @Prop({ required: false })
  offerId?: string;

  @Prop({ required: true, enum: ['wishlist_add', 'wishlist_remove', 'order_placed', 'order_accepted', 'order_rejected', 'admin_warning', 'new_follower', 'new_offer', 'expiring_offer', 'promotional', 'alert', 'emergency', 'system_update'], default: 'wishlist_add' })
  type: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: false })
  title?: string;

  @Prop({ default: false })
  read: boolean;

  @Prop()
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, read: 1 });

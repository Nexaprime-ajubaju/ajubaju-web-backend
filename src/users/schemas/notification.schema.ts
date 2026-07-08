import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  recipientId: string; // ad owner who receives the notification

  @Prop({ required: true })
  senderId: string; // user who wishlisted

  @Prop({ required: true })
  senderName: string;

  @Prop({ required: true })
  adId: string;

  @Prop({ required: true })
  adTitle: string;

  @Prop({
    required: true,
    enum: [
      'wishlist_add',
      'wishlist_remove',
      'order_placed',
      'order_accepted',
      'order_rejected',
      'admin_warning',
    ],
    default: 'wishlist_add',
  })
  type: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: false })
  read: boolean;

  @Prop()
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, read: 1 });

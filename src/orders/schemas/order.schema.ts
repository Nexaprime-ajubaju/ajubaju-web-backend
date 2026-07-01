import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

export enum OrderStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ required: true, index: true })
  merchantId: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: 1 })
  itemsCount: number;

  @Prop({ enum: OrderStatus, default: OrderStatus.PENDING, index: true })
  status: OrderStatus;

  @Prop({ type: Date, default: Date.now, index: true })
  placedAt: Date;

  @Prop({ type: Date })
  acceptedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // Link to the voucher that created this order
  @Prop({ index: true })
  voucherId?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ merchantId: 1, status: 1, placedAt: -1 });
OrderSchema.index({ merchantId: 1, placedAt: -1 });
OrderSchema.index({ voucherId: 1 });

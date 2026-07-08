import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
  CREATED = 'created',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  FAILED = 'failed',
  PARTIALLY_REFUNDED = 'partially_refunded',
  REFUNDED = 'refunded',
}

@Schema({ _id: false })
export class PaymentRefund {
  @Prop({ required: true })
  refundId: string;

  @Prop({ required: true })
  amountInPaise: number;

  @Prop({ default: 'processed' })
  status: string;

  @Prop()
  reason?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

const PaymentRefundSchema = SchemaFactory.createForClass(PaymentRefund);

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ required: true, unique: true })
  paymentId: string;

  @Prop({ required: true })
  userId: string;

  @Prop()
  adId?: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  amountInPaise: number;

  @Prop({ required: true, default: 'INR' })
  currency: string;

  @Prop({ required: true, default: 'razorpay' })
  provider: string;

  @Prop({
    required: true,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.CREATED,
  })
  status: PaymentStatus;

  @Prop({ required: true })
  receipt: string;

  @Prop()
  description?: string;

  @Prop({ type: Object, default: {} })
  notes?: Record<string, any>;

  @Prop({ sparse: true })
  idempotencyKey?: string;

  @Prop({ sparse: true, index: true })
  razorpayOrderId?: string;

  @Prop({ sparse: true, index: true })
  razorpayPaymentId?: string;

  @Prop()
  razorpaySignature?: string;

  @Prop({ default: 0 })
  refundedAmountInPaise: number;

  @Prop({ type: [PaymentRefundSchema], default: [] })
  refunds: PaymentRefund[];

  @Prop()
  method?: string;

  @Prop()
  failureCode?: string;

  @Prop()
  failureDescription?: string;

  @Prop({ type: [String], default: [] })
  processedWebhookEventIds: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ userId: 1, status: 1, createdAt: -1 });
PaymentSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SecurityEventDocument = SecurityEvent & Document;

export enum SecurityEventType {
  OFFER_LOCKED = 'OFFER_LOCKED',
  MERCHANT_RESTRICTED = 'MERCHANT_RESTRICTED',
  WARNING = 'WARNING',
  FINAL_WARNING = 'FINAL_WARNING',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'merchant_security_events',
})
export class SecurityEvent {
  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop()
  offerId?: string;

  @Prop({ required: true, enum: SecurityEventType })
  eventType: SecurityEventType;

  @Prop({ required: true })
  severity: string;

  @Prop({ required: true })
  message: string;

  @Prop({
    type: {
      attemptNumber: { type: Number },
      restrictionHours: { type: Number },
      imageHash: { type: String },
      failureReason: { type: String },
      requestId: { type: String },
    },
  })
  metadata?: {
    attemptNumber?: number;
    restrictionHours?: number;
    imageHash?: string;
    failureReason?: string;
    requestId?: string;
  };

  @Prop({ type: Date, default: Date.now, index: -1 })
  createdAt: Date;
}

export const SecurityEventSchema = SchemaFactory.createForClass(SecurityEvent);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum OfferReportReason {
  MISLEADING = 'misleading',
  FAKE = 'fake',
  INAPPROPRIATE = 'inappropriate',
  SCAM = 'scam',
  OTHER = 'other',
}

export enum OfferReportStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export type OfferReportDocument = OfferReport & Document;

@Schema({
  timestamps: true,
  collection: 'offer_reports',
})
export class OfferReport {
  @Prop({ type: String, required: true, unique: true })
  reportId: string;

  @Prop({ type: Types.ObjectId, ref: 'OfferPromotion', required: true, index: true })
  offerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reportedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Merchant', required: true, index: true })
  merchantId: Types.ObjectId; // The merchant who owns the offer

  @Prop({
    type: String,
    enum: OfferReportReason,
    required: true,
  })
  reason: OfferReportReason;

  @Prop({ type: String })
  description?: string;

  @Prop({
    type: String,
    enum: OfferReportStatus,
    default: OfferReportStatus.PENDING,
    index: true,
  })
  status: OfferReportStatus;

  @Prop({ type: String })
  resolvedBy?: string; // Admin userId

  @Prop({ type: String })
  resolutionNotes?: string;
}

export const OfferReportSchema = SchemaFactory.createForClass(OfferReport);

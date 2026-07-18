import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Ad } from '../../ads/schemas/category-schemas/ad.schema';
import { User } from '../../users/schemas/user.schema';

export enum ReportReason {
  SPAM = 'spam',
  INAPPROPRIATE = 'inappropriate',
  FRAUD = 'fraud',
  DUPLICATE = 'duplicate',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  ACTION_TAKEN = 'action_taken',
}

export type ReportDocument = Report & Document;

@Schema({
  timestamps: true,
  collection: 'reports',
})
export class Report {
  @Prop({ type: String, required: true, unique: true })
  reportId: string;

  @Prop({ type: String, ref: 'Ad', required: true, index: true })
  adId: string;

  @Prop({ type: String, ref: 'User', required: true, index: true })
  reportedBy: string;

  @Prop({
    type: String,
    enum: ReportReason,
    required: true,
    default: ReportReason.OTHER,
  })
  reason: ReportReason;

  @Prop({ type: String, maxlength: 500, trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ReportStatus,
    default: ReportStatus.PENDING,
    index: true,
  })
  status: ReportStatus;

  @Prop({ type: String, default: '' })
  adminNotes?: string;

  @Prop({ type: Date, default: Date.now })
  reviewedAt?: Date;

  @Prop({ type: String, ref: 'User' })
  reviewedBy?: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// Compound unique index to prevent duplicate reports from same user on same ad
ReportSchema.index({ adId: 1, reportedBy: 1 }, { unique: true });

// Index for fast lookup by status (for admin queue)
ReportSchema.index({ status: 1, createdAt: -1 });

// Index for counting reports per ad
ReportSchema.index({ adId: 1, status: 1 });

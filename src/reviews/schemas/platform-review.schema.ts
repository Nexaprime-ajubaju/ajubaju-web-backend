import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlatformReviewDocument = PlatformReview &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

export enum PlatformReviewStatus {
  APPROVED = 'approved',
  PENDING = 'pending',
  REJECTED = 'rejected',
}

export enum PlatformReviewSource {
  WEBSITE = 'website',
  CHOJA = 'choja',
  POST_REDEMPTION = 'post_redemption',
  APP = 'app',
}

@Schema({ timestamps: true, collection: 'platform_reviews' })
export class PlatformReview {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId; // User might be logged out when reviewing (though rare)

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: PlatformReviewSource, default: PlatformReviewSource.WEBSITE })
  source: PlatformReviewSource;

  @Prop({ enum: PlatformReviewStatus, default: PlatformReviewStatus.PENDING, index: true })
  status: PlatformReviewStatus;
}

export const PlatformReviewSchema = SchemaFactory.createForClass(PlatformReview);
PlatformReviewSchema.index({ status: 1, createdAt: -1 });

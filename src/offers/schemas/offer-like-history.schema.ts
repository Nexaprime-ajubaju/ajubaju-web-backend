import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OfferLikeHistoryDocument = OfferLikeHistory & Document;

@Schema({ timestamps: true, collection: 'offer_like_history' })
export class OfferLikeHistory {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true, index: true })
  offerPublicId: string;

  @Prop({ index: true })
  offerRequestId?: string;

  @Prop({ default: '' })
  offerTitle: string;

  @Prop({ default: '' })
  offerCategory: string;

  @Prop({ type: [Object], default: [] })
  selectedProducts: Array<any>;

  @Prop({ default: Date.now })
  firstLikedAt: Date;
}

export const OfferLikeHistorySchema =
  SchemaFactory.createForClass(OfferLikeHistory);
OfferLikeHistorySchema.index({ userId: 1, offerPublicId: 1 }, { unique: true });
OfferLikeHistorySchema.index({ merchantId: 1, firstLikedAt: -1 });

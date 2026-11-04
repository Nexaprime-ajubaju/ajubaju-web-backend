import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ItemDemandRequestDocument = ItemDemandRequest & Document;

export enum ItemRequestStatus {
  OPEN = 'OPEN',
  CONTACTED = 'CONTACTED',
  AVAILABLE = 'AVAILABLE',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true, collection: 'item_demand_requests' })
export class ItemDemandRequest {
  @Prop({ type: String, required: true, trim: true, lowercase: true, index: true })
  keyword: string;

  @Prop({ type: String, required: true, trim: true })
  originalQuery: string;

  @Prop({ type: String, required: false, index: true })
  userId?: string;

  @Prop({ type: String, required: false, index: true })
  sessionId?: string;

  @Prop({ type: String, required: true, trim: true })
  userContact: string; // Phone number or email

  @Prop({ type: String, default: '', trim: true })
  userName?: string;

  @Prop({ type: String, default: '', trim: true })
  location?: string;

  @Prop({
    type: String,
    enum: Object.values(ItemRequestStatus),
    default: ItemRequestStatus.OPEN,
    index: true,
  })
  status: ItemRequestStatus;

  @Prop({ type: String, default: '', trim: true })
  notes?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  requestedAt: Date;

  @Prop({ type: Date, required: false })
  notifiedAt?: Date;

  @Prop({ type: String, required: false, trim: true })
  notifiedProductId?: string;

  @Prop({ type: String, required: false, trim: true })
  notifiedItemTitle?: string;

  @Prop({ type: String, required: false, trim: true })
  notifiedItemType?: string;
}

export const ItemDemandRequestSchema =
  SchemaFactory.createForClass(ItemDemandRequest);

ItemDemandRequestSchema.index({ keyword: 1, requestedAt: -1 });
ItemDemandRequestSchema.index({ status: 1, requestedAt: -1 });

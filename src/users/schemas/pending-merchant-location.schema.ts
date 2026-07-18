import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PendingMerchantLocationDocument = PendingMerchantLocation &
  Document;

@Schema({ timestamps: true, collection: 'pending_merchant_locations' })
export class PendingMerchantLocation {
  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true })
  address: string;

  @Prop({ type: Number, required: true })
  latitude: number;

  @Prop({ type: Number, required: true })
  longitude: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PendingMerchantLocationSchema = SchemaFactory.createForClass(
  PendingMerchantLocation,
);
PendingMerchantLocationSchema.index({ email: 1 });

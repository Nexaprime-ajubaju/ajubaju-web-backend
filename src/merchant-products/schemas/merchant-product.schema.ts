import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MerchantProductDocument = MerchantProduct & Document;

@Schema({ timestamps: true, collection: 'merchant_products' })
export class MerchantProduct {
  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ required: true, min: 0 })
  stockQuantity: number;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, default: null })
  videoUrl: string;

  @Prop({ required: true, enum: ['In Stock', 'Low Stock', 'Out of Stock'] })
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MerchantProductSchema =
  SchemaFactory.createForClass(MerchantProduct);

MerchantProductSchema.index({ merchantId: 1, createdAt: -1 });
MerchantProductSchema.index({ merchantId: 1, name: 1 });

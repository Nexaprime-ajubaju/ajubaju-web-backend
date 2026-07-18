import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrendingProductDocument = TrendingProduct & Document;

@Schema({ timestamps: true })
export class TrendingProduct {
  @Prop({ required: true, index: true })
  productId: string;

  @Prop({ required: true, index: true })
  geohash: string; // The locality where this product is trending

  @Prop({ required: true })
  score: number; // The computed trending score

  @Prop({ required: true })
  rank: number; // Relative rank in this locality

  @Prop()
  updatedAt?: Date;
}

export const TrendingProductSchema =
  SchemaFactory.createForClass(TrendingProduct);

// Compound index for fast queries by locality sorted by score/rank
TrendingProductSchema.index({ geohash: 1, rank: 1 });

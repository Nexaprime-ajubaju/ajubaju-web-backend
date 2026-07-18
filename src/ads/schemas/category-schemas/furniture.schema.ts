import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FurnitureDocument = Furniture & Document;

@Schema({ _id: false, timestamps: false })
export class Furniture {
  @Prop({
    enum: [
      'Sofa',
      'Bed',
      'Dining Table',
      'Chair',
      'Table',
      'Wardrobe',
      'Dressing Table',
      'Bookshelf',
      'Cabinet',
      'Mattress',
      'Other',
    ],
  })
  furnitureType?: string;

  @Prop()
  material?: string;

  @Prop()
  dimensions?: string;

  @Prop()
  condition?: string;

  @Prop()
  price?: number;

  @Prop()
  negotiable?: boolean;
}

export const FurnitureSchema = SchemaFactory.createForClass(Furniture);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PropertyDocument = Property & Document;

@Schema({ _id: false, timestamps: false })
export class Property {
  @Prop({ enum: ['Rent', 'Sell'] })
  listingType?: string;

  @Prop({
    enum: ['Apartment', 'House', 'Villa', 'Commercial', 'Land', 'Office'],
  })
  propertyType?: string;

  @Prop()
  rent?: number;

  @Prop()
  bhk?: string;
}

export const PropertySchema = SchemaFactory.createForClass(Property);

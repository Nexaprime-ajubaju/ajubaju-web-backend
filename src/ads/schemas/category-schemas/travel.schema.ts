import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TravelDocument = Travel & Document;

@Schema({ _id: false, timestamps: false })
export class Travel {
  @Prop()
  travelDate?: Date;
}

export const TravelSchema = SchemaFactory.createForClass(Travel);

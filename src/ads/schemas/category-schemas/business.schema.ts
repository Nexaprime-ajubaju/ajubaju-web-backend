import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BusinessDocument = Business & Document;

@Schema({ _id: false, timestamps: false })
export class Business {
  @Prop()
  businessType?: string;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);

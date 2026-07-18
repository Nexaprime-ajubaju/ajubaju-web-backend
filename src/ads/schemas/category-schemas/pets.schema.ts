import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PetsDocument = Pets & Document;

@Schema({ _id: false, timestamps: false })
export class Pets {
  @Prop()
  species?: string;

  @Prop()
  breed?: string;

  @Prop()
  age?: number | string;

  @Prop()
  gender?: string;

  @Prop()
  weight?: string;
}

export const PetsSchema = SchemaFactory.createForClass(Pets);

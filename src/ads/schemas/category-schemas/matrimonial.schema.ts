import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MatrimonialDocument = Matrimonial & Document;

@Schema({ _id: false, timestamps: false })
export class Matrimonial {
  @Prop()
  profileFor?: string;

  @Prop()
  name?: string;

  @Prop()
  age?: number;

  @Prop()
  gender?: string;

  @Prop()
  height?: string;

  @Prop()
  maritalStatus?: string;

  @Prop()
  religion?: string;

  @Prop()
  caste?: string;

  @Prop()
  education?: string;

  @Prop()
  occupation?: string;

  @Prop()
  annualIncome?: string;

  @Prop()
  city?: string;

  @Prop()
  about?: string;
}

export const MatrimonialSchema = SchemaFactory.createForClass(Matrimonial);

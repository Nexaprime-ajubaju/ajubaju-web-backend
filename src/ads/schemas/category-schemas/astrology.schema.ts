import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AstrologyDocument = Astrology & Document;

@Schema({ _id: false, timestamps: false })
export class Astrology {
  @Prop()
  consultationMode?: string;
}

export const AstrologySchema = SchemaFactory.createForClass(Astrology);

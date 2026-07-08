import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ServiceDocument = Service & Document;

@Schema({ _id: false, timestamps: false })
export class Service {
  @Prop()
  serviceCategory?: string;

  @Prop()
  experience?: number | string;

  @Prop()
  charges?: number | string;

  @Prop()
  availableTime?: string;

  @Prop({ type: [String] })
  serviceArea?: string[] | string;

  @Prop()
  bio?: string;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

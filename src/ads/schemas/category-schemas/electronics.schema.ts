import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ElectronicsDocument = Electronics & Document;

@Schema({ _id: false, timestamps: false })
export class Electronics {
  @Prop()
  applianceType?: string;

  @Prop()
  brand?: string;

  @Prop()
  model?: string;

  @Prop()
  condition?: string;

  @Prop()
  warranty?: string;

  @Prop()
  price?: number;
}

export const ElectronicsSchema = SchemaFactory.createForClass(Electronics);

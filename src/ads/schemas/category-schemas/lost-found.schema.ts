import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LostFoundDocument = LostFound & Document;

@Schema({ _id: false, timestamps: false })
export class LostFound {
  @Prop({ enum: ['Lost', 'Found'] })
  status?: string;

  @Prop()
  itemName?: string;

  @Prop()
  itemType?: string;

  @Prop()
  description?: string;

  @Prop()
  location?: string;
}

export const LostFoundSchema = SchemaFactory.createForClass(LostFound);

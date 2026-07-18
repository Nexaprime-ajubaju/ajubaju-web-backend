import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MobileDocument = Mobile & Document;

@Schema({ _id: false, timestamps: false })
export class Mobile {
  @Prop()
  brand?: string;

  @Prop()
  model?: string;

  @Prop({ enum: ['New', 'Like New', 'Good', 'Fair', 'Broken'] })
  condition?: string;

  @Prop()
  warranty?: string;

  @Prop()
  price?: number;

  @Prop()
  negotiable?: boolean;
}

export const MobileSchema = SchemaFactory.createForClass(Mobile);

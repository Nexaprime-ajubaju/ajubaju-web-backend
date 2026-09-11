import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '-' })
  parent: string;

  @Prop({ default: 'Active', enum: ['Active', 'Hidden'] })
  status: string;

  @Prop({ default: 'golo', enum: ['golo', 'choja'] })
  platform: string;

  @Prop()
  description: string;

  @Prop()
  metaTitle: string;

  @Prop()
  metaDescription: string;

  @Prop()
  icon: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

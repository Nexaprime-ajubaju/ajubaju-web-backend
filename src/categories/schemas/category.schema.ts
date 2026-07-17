import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: 'None (Root Category)' })
  parent: string;

  @Prop({ default: 'Active' })
  status: string;

  @Prop({ default: false })
  featured: boolean;
  
  @Prop({ default: 0 })
  listings: number; // Placeholder for static listing count
}

export const CategorySchema = SchemaFactory.createForClass(Category);

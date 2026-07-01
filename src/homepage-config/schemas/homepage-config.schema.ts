import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type HomepageConfigDocument = HomepageConfig & Document;

@Schema({ _id: false })
export class HomepageSection {
  @Prop({ required: true })
  key: string;

  @Prop()
  strategy?: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop()
  icon: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 10 })
  limit: number;

  @Prop({ required: true })
  displayOrder: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, any>;
}

const HomepageSectionSchema = SchemaFactory.createForClass(HomepageSection);

@Schema({ timestamps: true })
export class HomepageConfig {
  @Prop({ required: true, default: 1 })
  version: number;

  @Prop({ required: false })
  updatedBy: string;

  @Prop({ type: [HomepageSectionSchema], default: [] })
  sections: HomepageSection[];
}

export const HomepageConfigSchema = SchemaFactory.createForClass(HomepageConfig);

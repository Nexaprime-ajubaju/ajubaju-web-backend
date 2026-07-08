import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExperimentDocument = Experiment & Document;

@Schema({ timestamps: true })
export class Experiment {
  @Prop({ required: true, unique: true })
  name: string; // e.g., 'Homepage_Ranking_Test_Q3'

  @Prop({
    required: true,
    enum: ['active', 'draft', 'completed'],
    default: 'draft',
  })
  status: string;

  @Prop({ type: [{ key: String, weight: Number }], default: [] })
  variants: { key: string; weight: number }[]; // e.g., [{ key: 'default', weight: 50 }, { key: 'popularity-heavy', weight: 50 }]
}

export const ExperimentSchema = SchemaFactory.createForClass(Experiment);

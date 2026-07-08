import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmploymentDocument = Employment & Document;

@Schema({ _id: false, timestamps: false })
export class Employment {
  @Prop({
    enum: ['Full Time', 'Part Time', 'Contract', 'Internship', 'Freelance'],
  })
  jobType?: string;

  @Prop()
  jobTitle?: string;

  @Prop()
  companyName?: string;

  @Prop()
  experienceRequired?: string;

  @Prop()
  salary?: string;

  @Prop()
  qualifications?: string;

  @Prop()
  description?: string;

  @Prop()
  vacancies?: number;
}

export const EmploymentSchema = SchemaFactory.createForClass(Employment);

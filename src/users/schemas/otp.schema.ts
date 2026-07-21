import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OTPDocument = OTP & Document;

@Schema({ timestamps: true })
export class OTP {
  @Prop({ required: false, index: true })
  phone?: string;

  @Prop({ required: false, index: true })
  email?: string;

  @Prop({ required: true })
  otp: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  verified: boolean;
}

export const OTPSchema = SchemaFactory.createForClass(OTP);

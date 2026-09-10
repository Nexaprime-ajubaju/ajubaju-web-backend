import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

@Schema({ timestamps: true })
export class WalletTransaction {
  @Prop({ required: true })
  userId: string; // Can be user or merchant ID

  @Prop({ required: true, enum: ['user', 'merchant'] })
  userType: 'user' | 'merchant';

  @Prop({ required: true, enum: ['credit', 'debit'] })
  type: 'credit' | 'debit';

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  description: string;

  @Prop()
  referenceId?: string; // E.g., Banner ID or Ad ID

  @Prop({ enum: ['banner', 'ad', 'subscription', 'other'], default: 'other' })
  referenceType?: string;

  @Prop({ default: 'completed', enum: ['pending', 'completed', 'failed'] })
  status: 'pending' | 'completed' | 'failed';

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);

WalletTransactionSchema.index({ userId: 1, userType: 1 });

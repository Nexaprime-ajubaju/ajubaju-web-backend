import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DeletedAccountDocument = DeletedAccount & Document;

@Schema({ timestamps: true, collection: 'deletedaccounts' })
export class DeletedAccount {
  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true, enum: ['user', 'merchant', 'customer'] })
  accountType: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop()
  storeName?: string;

  @Prop()
  storeCategory?: string;

  @Prop()
  storeLocation?: string;

  @Prop({ required: true })
  reason: string;

  @Prop()
  customReason?: string;

  @Prop({ required: true, default: 'self' })
  deletedBy: string; // 'merchant', 'user', 'admin'

  @Prop()
  deletedByAdminEmail?: string;

  @Prop({ default: Date.now })
  deletedAt: Date;
}

export const DeletedAccountSchema =
  SchemaFactory.createForClass(DeletedAccount);

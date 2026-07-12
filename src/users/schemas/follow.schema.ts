import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FollowDocument = Follow & Document;

@Schema({ timestamps: true, collection: 'follows' })
export class Follow {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);
FollowSchema.index({ userId: 1, merchantId: 1 }, { unique: true });

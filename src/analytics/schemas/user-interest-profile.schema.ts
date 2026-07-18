import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserInterestProfileDocument = UserInterestProfile & Document;

@Schema({ _id: false })
class InterestVector {
  @Prop({ type: Object, default: {} })
  tags: Record<string, number>;

  @Prop({ type: Object, default: {} })
  categories: Record<string, number>;

  @Prop({ type: Object, default: {} })
  merchants: Record<string, number>;
}

@Schema({ timestamps: true })
export class UserInterestProfile {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({
    type: InterestVector,
    default: () => ({ tags: {}, categories: {}, merchants: {} }),
  })
  shortTerm: InterestVector;

  @Prop({
    type: InterestVector,
    default: () => ({ tags: {}, categories: {}, merchants: {} }),
  })
  longTerm: InterestVector;

  @Prop({ default: 0 })
  confidence: number;

  @Prop({ default: 0 })
  interactionCount: number;

  @Prop({ default: 2 })
  version: number;

  @Prop()
  updatedAt?: Date;
}

export const UserInterestProfileSchema =
  SchemaFactory.createForClass(UserInterestProfile);

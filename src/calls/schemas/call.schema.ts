import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CallDocument = Call & Document;

export type CallType = 'audio' | 'video';
export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'accepted'
  | 'rejected'
  | 'missed'
  | 'ended'
  | 'failed'
  | 'busy';

@Schema({ timestamps: true, collection: 'calls' })
export class Call {
  @Prop({ required: true, unique: true, index: true })
  callId: string;

  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true, index: true })
  callerId: string;

  @Prop({ required: true, index: true })
  calleeId: string;

  @Prop({ required: true, enum: ['audio', 'video'] })
  type: CallType;

  @Prop({
    required: true,
    enum: [
      'initiated',
      'ringing',
      'accepted',
      'rejected',
      'missed',
      'ended',
      'failed',
      'busy',
    ],
    default: 'initiated',
    index: true,
  })
  status: CallStatus;

  @Prop()
  startedAt?: Date;

  @Prop()
  answeredAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  durationSec?: number;

  @Prop({
    enum: ['hangup', 'declined', 'timeout', 'network_error', 'busy', 'failed'],
  })
  endReason?: string;

  @Prop({ type: [String], default: [] })
  participants: string[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CallSchema = SchemaFactory.createForClass(Call);

CallSchema.index({ participants: 1, createdAt: -1 });
CallSchema.index({ conversationId: 1, createdAt: -1 });

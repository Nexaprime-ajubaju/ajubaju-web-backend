import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export type OutboxEventDocument = OutboxEvent & Document;

@Schema({ timestamps: true })
export class OutboxEvent {
  @Prop({ required: true, default: uuidv4, unique: true })
  eventId: string;

  @Prop({ required: true })
  topic: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({
    required: true,
    enum: ['pending', 'processed', 'failed'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: Number, default: 0 })
  retryCount: number;

  @Prop()
  lastError?: string;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

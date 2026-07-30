import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BannerSchedulerStateDocument = BannerSchedulerState & Document;

@Schema({ timestamps: true, collection: 'banner_scheduler_states' })
export class BannerSchedulerState {
  @Prop({ required: true, unique: true, index: true })
  city: string;

  @Prop({ required: true, default: 0 })
  pointer: number;

  @Prop({ required: true, default: 0 })
  generation: number;

  @Prop({ required: true, enum: ['A', 'B', 'C'], default: 'A' })
  activeGroup: string;

  @Prop({ required: true, default: 1 })
  queueVersion: number;

  @Prop({ default: Date.now })
  lastRotation: Date;

  @Prop({ default: Date.now })
  nextRotation: Date;

  @Prop({ default: true })
  isRunning: boolean;

  @Prop({ default: Date.now })
  lastHeartbeat: Date;

  @Prop({ default: 0 })
  rotationTimeMs: number;

  @Prop({ default: 0 })
  schedulerDelayMs: number;

  @Prop({ default: 0 })
  cacheMisses: number;

  @Prop({ default: 0 })
  duplicateSkips: number;
}

export const BannerSchedulerStateSchema =
  SchemaFactory.createForClass(BannerSchedulerState);

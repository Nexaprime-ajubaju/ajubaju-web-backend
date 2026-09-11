import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportTicketDocument = SupportTicket & Document;

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  @Prop({ required: true, unique: true, index: true })
  ticketId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  customerName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  issueType: string;

  @Prop({ required: true })
  description: string;

  @Prop({ default: 'Medium' })
  priority: string; // Low, Medium, High, Critical

  @Prop({ default: 'Open' })
  status: string; // Open, In Progress, Resolved, Closed

  @Prop({ default: '' })
  adminNotes: string;

  @Prop({
    type: [
      {
        by: { type: String, enum: ['user', 'agent'] },
        text: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  chatHistory: Array<{
    by: string;
    text: string;
    timestamp: Date;
  }>;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);

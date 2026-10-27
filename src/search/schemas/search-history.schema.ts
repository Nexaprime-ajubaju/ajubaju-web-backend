import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SearchHistoryDocument = SearchHistory & Document;

@Schema({ timestamps: true, collection: 'search_histories' })
export class SearchHistory {
  @Prop({ type: String, required: false, index: true })
  userId?: string;

  @Prop({ type: String, required: false, index: true })
  sessionId?: string;

  @Prop({ type: String, required: true, trim: true })
  query: string;

  @Prop({ type: String, default: '', trim: true })
  location?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  searchedAt: Date;
}

export const SearchHistorySchema = SchemaFactory.createForClass(SearchHistory);

// Compound indexes for optimal performance
SearchHistorySchema.index({ userId: 1, searchedAt: -1 });
SearchHistorySchema.index({ sessionId: 1, searchedAt: -1 });
SearchHistorySchema.index({ userId: 1, query: 1 });
SearchHistorySchema.index({ sessionId: 1, query: 1 });

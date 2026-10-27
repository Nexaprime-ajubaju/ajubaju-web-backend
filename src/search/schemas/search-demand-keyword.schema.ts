import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SearchDemandKeywordDocument = SearchDemandKeyword & Document;

export enum DemandStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  CONTACTED = 'CONTACTED',
  ONBOARDED = 'ONBOARDED',
  IGNORED = 'IGNORED',
}

@Schema({ _id: false })
export class LocationStat {
  @Prop({ type: String, required: true, trim: true })
  location: string;

  @Prop({ type: Number, default: 1 })
  count: number;
}
export const LocationStatSchema = SchemaFactory.createForClass(LocationStat);

@Schema({ _id: false })
export class ResultBreakdown {
  @Prop({ type: Number, default: 0 })
  storesCount: number;

  @Prop({ type: Number, default: 0 })
  productsCount: number;

  @Prop({ type: Number, default: 0 })
  offersCount: number;
}
export const ResultBreakdownSchema = SchemaFactory.createForClass(ResultBreakdown);

@Schema({ timestamps: true, collection: 'search_demand_keywords' })
export class SearchDemandKeyword {
  @Prop({
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  })
  keyword: string;

  @Prop({ type: [String], default: [] })
  originalQueries: string[];

  @Prop({ type: Number, default: 1, index: true })
  searchCount: number;

  @Prop({ type: Number, default: 1, index: true })
  uniqueUsersCount: number;

  @Prop({ type: [String], default: [] })
  userIds: string[];

  @Prop({ type: [String], default: [] })
  sessionIds: string[];

  @Prop({ type: [LocationStatSchema], default: [] })
  locations: LocationStat[];

  @Prop({ type: Number, default: 0 })
  lastResultCount: number;

  @Prop({
    type: ResultBreakdownSchema,
    default: () => ({ storesCount: 0, productsCount: 0, offersCount: 0 }),
  })
  breakdown: ResultBreakdown;

  @Prop({ type: Date, default: Date.now, index: true })
  firstSearchedAt: Date;

  @Prop({ type: Date, default: Date.now, index: true })
  lastSearchedAt: Date;

  @Prop({
    type: String,
    enum: Object.values(DemandStatus),
    default: DemandStatus.PENDING,
    index: true,
  })
  status: DemandStatus;

  @Prop({ type: String, default: '', trim: true })
  suggestedCategory?: string;

  @Prop({ type: String, default: '', trim: true })
  notes?: string;
}

export const SearchDemandKeywordSchema =
  SchemaFactory.createForClass(SearchDemandKeyword);

// Performance compound indexes
SearchDemandKeywordSchema.index({ searchCount: -1, lastSearchedAt: -1 });
SearchDemandKeywordSchema.index({ uniqueUsersCount: -1 });
SearchDemandKeywordSchema.index({ status: 1, searchCount: -1 });
SearchDemandKeywordSchema.index({ 'locations.location': 1 });

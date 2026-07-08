import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleDocument = Vehicle & Document;

@Schema({ _id: false, timestamps: false })
export class Vehicle {
  @Prop({ enum: ['Rent', 'Sell'] })
  type?: string;

  @Prop()
  vehicleType?: string;

  @Prop()
  brand?: string;

  @Prop()
  model?: string;

  @Prop()
  brandModel?: string;

  @Prop()
  rentAmount?: number;

  @Prop()
  securityDeposit?: number;

  @Prop({ enum: ['Yes', 'No', 'Both'] })
  includesDriver?: string;

  @Prop()
  minRentalDuration?: string;

  @Prop()
  year?: number;

  @Prop({ enum: ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'] })
  fuelType?: string;

  @Prop({ enum: ['Manual', 'Automatic'] })
  transmission?: string;

  @Prop()
  kilometersDriven?: number;

  @Prop()
  price?: number;

  @Prop()
  insurance?: string;

  @Prop()
  ownerNumber?: number;

  @Prop()
  condition?: string;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);

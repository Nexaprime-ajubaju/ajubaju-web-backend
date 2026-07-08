import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PropertyDto {
  @IsEnum(['Rent', 'Sell'])
  type: string;

  @IsEnum(['Apartment', 'House', 'Villa', 'Commercial', 'Land', 'Office'])
  propertyType: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  area: number;

  @IsString()
  areaUnit: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  bedrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  bathrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  balconies?: number;

  @IsOptional()
  @IsString()
  furnishing?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maintenanceCharges?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  floorNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  totalFloors?: number;

  @IsOptional()
  @IsString()
  facing?: string;

  @IsOptional()
  @IsString()
  parking?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @Type(() => Date)
  possessionDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  ageOfProperty?: number;

  @IsOptional()
  @IsBoolean()
  gatedCommunity?: boolean;

  @IsOptional()
  @IsBoolean()
  powerBackup?: boolean;
}
// Make sure this closing brace exists

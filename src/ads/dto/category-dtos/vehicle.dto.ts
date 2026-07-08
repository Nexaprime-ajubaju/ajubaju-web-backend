import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VehicleDto {
  @IsEnum(['Rent', 'Sell'])
  type: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  brandModel?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  rentAmount?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  securityDeposit?: number;

  @IsOptional()
  @IsEnum(['Yes', 'No', 'Both'])
  includesDriver?: string;

  @IsOptional()
  @IsString()
  minRentalDuration?: string;

  @IsOptional()
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsEnum(['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'])
  fuelType?: string;

  @IsOptional()
  @IsEnum(['Manual', 'Automatic'])
  transmission?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  kilometersDriven?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  insurance?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  ownerNumber?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsBoolean()
  emiAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  exchangeAvailable?: boolean;
}

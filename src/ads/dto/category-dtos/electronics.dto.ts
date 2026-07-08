import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ElectronicsDto {
  @IsEnum([
    'TV',
    'Refrigerator',
    'Washing Machine',
    'Microwave',
    'Air Conditioner',
    'Laptop',
    'Desktop',
    'Tablet',
    'Camera',
    'Speaker',
    'Headphones',
    'Gaming Console',
    'Printer',
    'Router',
    'Smart Watch',
    'Other',
  ])
  productType: string;

  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsOptional()
  @IsNumber()
  @Min(1900)
  @Type(() => Number)
  yearOfPurchase?: number;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsObject()
  specifications?: Map<string, string>;

  @IsOptional()
  @IsString()
  warranty?: string;

  @IsOptional()
  @Type(() => Date)
  warrantyExpiry?: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessories?: string[];

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  originalPrice?: number;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsOptional()
  @IsBoolean()
  billAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  boxAvailable?: boolean;

  @IsOptional()
  @IsString()
  powerSupply?: string;
}

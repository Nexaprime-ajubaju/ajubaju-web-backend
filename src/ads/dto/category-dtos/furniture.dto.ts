import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FurnitureDto {
  @IsEnum([
    'Sofa',
    'Bed',
    'Dining Table',
    'Chair',
    'Table',
    'Wardrobe',
    'Dressing Table',
    'Bookshelf',
    'Cabinet',
    'Mattress',
    'Other',
  ])
  furnitureType: string;

  @IsString()
  material: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weight?: number;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsBoolean()
  assemblyRequired?: boolean;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsNumber()
  @Min(1900)
  @Type(() => Number)
  yearOfPurchase?: number;

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
  deliveryAvailable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  deliveryCharges?: number;
}

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

export class MobileDto {
  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsString()
  storage: string;

  @IsString()
  ram: string;

  @IsString()
  color: string;

  @IsEnum(['New', 'Like New', 'Good', 'Fair', 'Broken'])
  condition: string;

  @IsOptional()
  @IsString()
  batteryHealth?: string;

  @IsOptional()
  @IsString()
  screenSize?: string;

  @IsOptional()
  @IsString()
  processor?: string;

  @IsOptional()
  @IsString()
  rearCamera?: string;

  @IsOptional()
  @IsString()
  frontCamera?: string;

  @IsOptional()
  @IsString()
  warranty?: string;

  @IsOptional()
  @Type(() => Date)
  warrantyExpiry?: Date;

  @IsOptional()
  @IsBoolean()
  boxIncluded?: boolean;

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
  @IsString()
  imeiNumber?: string;

  @IsOptional()
  @IsBoolean()
  dualSim?: boolean;

  @IsOptional()
  @IsBoolean()
  hashas5G?: boolean;

  @IsOptional()
  @IsBoolean()
  waterResistant?: boolean;

  @IsOptional()
  @IsBoolean()
  fastCharging?: boolean;
}

import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  Min,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BusinessDto {
  @IsEnum(['Promotion', 'Partnership', 'Investment', 'Sale', 'Franchise'])
  type: string;

  @IsString()
  businessName: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsNumber()
  @Min(1800)
  @Type(() => Number)
  establishedYear?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  investment?: number;

  @IsOptional()
  @IsString()
  expectedReturn?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  employees?: number;

  @IsOptional()
  @IsString()
  turnover?: string;

  @IsOptional()
  @IsString()
  profitMargin?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  documents?: string;
}

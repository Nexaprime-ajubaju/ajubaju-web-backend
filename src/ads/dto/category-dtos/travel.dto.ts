import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEmail,
  IsUrl,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TravelDto {
  @IsEnum(['Package', 'Guide', 'Transport', 'Accommodation', 'Trip'])
  type: string;

  @IsString()
  destination: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsString()
  inclusions?: string;

  @IsOptional()
  @IsString()
  exclusions?: string;

  @IsOptional()
  @IsString()
  itinerary?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  groupSize?: number;

  @IsOptional()
  @IsString()
  accommodation?: string;

  @IsOptional()
  @IsBoolean()
  mealsIncluded?: boolean;

  @IsOptional()
  @IsString()
  transportation?: string;

  @IsOptional()
  @IsBoolean()
  guideIncluded?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activities?: string[];

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  website?: string;
}

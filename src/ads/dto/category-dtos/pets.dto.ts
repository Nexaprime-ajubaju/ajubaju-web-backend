import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PetsDto {
  @IsEnum(['Dog', 'Cat', 'Bird', 'Fish', 'Rabbit', 'Hamster', 'Other'])
  petType: string;

  @IsOptional()
  @IsString()
  breed?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  age?: number;

  @IsOptional()
  @IsString()
  ageUnit?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsBoolean()
  vaccinated?: boolean;

  @IsOptional()
  @IsBoolean()
  dewormed?: boolean;

  @IsOptional()
  @IsBoolean()
  microchipped?: boolean;

  @IsOptional()
  @IsBoolean()
  neutered?: boolean;

  @IsOptional()
  @IsBoolean()
  healthCertificate?: boolean;

  @IsOptional()
  @IsBoolean()
  trained?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  pedigree?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

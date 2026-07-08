import {
  IsEnum,
  IsString,
  IsOptional,
  IsArray,
  IsEmail,
  IsUrl,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LostFoundDto {
  @IsEnum(['Lost', 'Found'])
  type: string;

  @IsString()
  itemName: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  distinctiveFeatures?: string;

  @IsOptional()
  @IsString()
  lostFoundLocation?: string;

  @IsOptional()
  @Type(() => Date)
  lostFoundDate?: Date;

  @IsOptional()
  @IsString()
  reward?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsString()
  contactNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];
}

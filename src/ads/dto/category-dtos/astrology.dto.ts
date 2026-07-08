import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  IsUrl,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AstrologyDto {
  @IsEnum(['Consultation', 'Horoscope', 'Puja', 'Remedies'])
  serviceType: string;

  @IsOptional()
  @IsString()
  astrologerName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  experience?: number;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  consultationMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  charges?: number;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  availableTimings?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  about?: string;
}

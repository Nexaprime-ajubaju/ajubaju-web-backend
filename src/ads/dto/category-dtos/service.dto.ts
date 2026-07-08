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

export class ServiceDto {
  @IsEnum([
    'Plumber',
    'Electrician',
    'Carpenter',
    'Painter',
    'Cleaner',
    'AC Repair',
    'Appliance Repair',
    'Pest Control',
    'Packers Movers',
    'Beauty Parlor',
    'Salon at Home',
    'Spa',
    'Photographer',
    'Event Planner',
    'Tutor',
    'Driver',
    'Security Guard',
    'Web Developer',
    'Designer',
    'Catering',
    'Other',
  ])
  serviceType: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  experience: number;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  hourlyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  dailyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  projectRate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableDays?: string[];

  @IsOptional()
  @IsString()
  availableTimeFrom?: string;

  @IsOptional()
  @IsString()
  availableTimeTo?: string;

  @IsOptional()
  @IsBoolean()
  emergencyService?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  emergencyCharge?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceArea?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  serviceRadius?: number;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsBoolean()
  insured?: boolean;

  @IsOptional()
  @IsBoolean()
  professionalTools?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  teamSize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
}

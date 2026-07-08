import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  IsUrl,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EmploymentDto {
  @IsEnum(['Full Time', 'Part Time', 'Contract', 'Internship', 'Freelance'])
  jobType: string;

  @IsString()
  jobTitle: string;

  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  experienceRequired?: string;

  @IsOptional()
  @IsString()
  salary?: string;

  @IsOptional()
  @IsString()
  qualifications?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  vacancies?: number;

  @IsOptional()
  @Type(() => Date)
  lastDateToApply?: Date;

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
  @IsUrl()
  website?: string;
}

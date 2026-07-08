import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EducationDto {
  @IsEnum(['School', 'College', 'Coaching', 'Tutorial', 'Online Course'])
  institutionType: string;

  @IsString()
  institutionName: string;

  @IsOptional()
  @IsString()
  courseName?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fees?: number;

  @IsOptional()
  @IsString()
  eligibility?: string;

  @IsOptional()
  @Type(() => Date)
  admissionStartDate?: Date;

  @IsOptional()
  @Type(() => Date)
  admissionEndDate?: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  facilities?: string[];

  @IsOptional()
  @IsString()
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
  @IsString()
  affiliatedTo?: string;

  @IsOptional()
  @IsString()
  accreditation?: string;

  @IsOptional()
  @IsNumber()
  @Min(1800)
  @Type(() => Number)
  establishedYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  studentCapacity?: number;
}

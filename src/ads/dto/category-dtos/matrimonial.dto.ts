import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MatrimonialDto {
  @IsString()
  profileFor: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(18)
  @Max(100)
  @Type(() => Number)
  age: number;

  @IsEnum(['Male', 'Female', 'Other'])
  gender: string;

  @IsOptional()
  @IsString()
  height?: string;

  @IsOptional()
  @IsString()
  weight?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  religion?: string;

  @IsOptional()
  @IsString()
  caste?: string;

  @IsOptional()
  @IsString()
  motherTongue?: string;

  @IsOptional()
  @IsString()
  education?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  annualIncome?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hobbies?: string[];

  @IsOptional()
  @IsString()
  diet?: string;

  @IsOptional()
  @IsString()
  drink?: string;

  @IsOptional()
  @IsString()
  smoke?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

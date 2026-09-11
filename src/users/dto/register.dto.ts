import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsPhoneNumber,
  IsIn,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsPhoneNumber()
  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'others', 'prefer_not_to_say'])
  gender?: 'male' | 'female' | 'others' | 'prefer_not_to_say';

  @IsOptional()
  @IsIn(['user', 'merchant'])
  accountType?: 'user' | 'merchant';

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsEmail()
  storeEmail?: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  storeCategory?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsIn(['Merchant', 'Service Provider', 'Both'])
  merchantRole?: string;

  @IsOptional()
  yearsInBusiness?: number | string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @IsOptional()
  @IsString()
  shopPhoto?: string;

  @IsOptional()
  documents?: {
    aadhaarUrl?: string;
    panUrl?: string;
    businessDocs?: Record<string, string>;
  };
  @IsOptional()
  @IsString()
  storeSubCategory?: string;

  @IsOptional()
  @IsString()
  storeLocation?: string;

  @IsOptional()
  storeLocationLatitude?: number | string;

  @IsOptional()
  storeLocationLongitude?: number | string;

  @IsOptional()
  latitude?: number | string;

  @IsOptional()
  longitude?: number | string;

  @IsOptional()
  lat?: number | string;

  @IsOptional()
  lng?: number | string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

// No separate Merchant DTO needed anymore

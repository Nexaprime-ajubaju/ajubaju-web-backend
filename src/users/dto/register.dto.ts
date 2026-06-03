import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsPhoneNumber,
  IsIn,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

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
}

// No separate Merchant DTO needed anymore

import { IsOptional, IsString, IsEmail } from 'class-validator';

export class UpdateMerchantProfileDto {
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
  @IsString()
  profilePhoto?: string;

  @IsOptional()
  @IsString()
  shopPhoto?: string;
}

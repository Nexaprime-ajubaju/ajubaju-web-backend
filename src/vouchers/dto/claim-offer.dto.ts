import { IsString, IsEmail, IsOptional, IsNumber } from 'class-validator';

export class ClaimOfferDto {
  @IsString()
  offerId: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  location?: string;
}

export class ShareVoucherDto {
  @IsEmail()
  friendEmail: string;
}

export class VerifyVoucherDto {
  @IsString()
  qrCode: string;
}

export class RedeemVoucherDto {
  @IsOptional()
  @IsString()
  qrCode?: string;

  @IsOptional()
  @IsString()
  verificationCode?: string;
}

export class GetMyVouchersDto {
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 10;

  @IsOptional()
  @IsString()
  status?: string; // 'active', 'claimed', 'redeemed', 'expired'
}

export class GetMerchantVouchersDto {
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;
}

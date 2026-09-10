import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class PayBannerPromotionDto {
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsBoolean()
  useWallet?: boolean;

  @IsOptional()
  @IsNumber()
  walletAmount?: number;
}

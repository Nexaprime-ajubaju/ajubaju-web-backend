import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OfferSelectedProductDto {
  @IsString()
  productId: string;

  @IsString()
  productName: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  originalPrice: number;

  @IsNumber()
  @Min(0)
  offerPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;
}

export enum BannerAction {
  PAUSE = 'pause',
  RESUME = 'resume',
}

export class UpdateBannerPromotionDto {
  @IsOptional()
  @IsString()
  bannerTitle?: string;

  @IsOptional()
  @IsString()
  bannerCategory?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/, {
    message: 'imageUrl must be a URL address or uploaded image data',
  })
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedDates?: string[];

  @IsOptional()
  @IsString()
  recommendedSize?: string;

  @IsOptional()
  @IsEnum(BannerAction)
  action?: 'pause' | 'resume';

  @IsOptional()
  @IsBoolean()
  loyaltyRewardEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyStarsToOffer?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyStarsPerPurchase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyScorePerStar?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltyPointsPerPurchase?: number;

  @IsOptional()
  @IsString()
  promotionExpiryText?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsString()
  exampleUsage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferSelectedProductDto)
  selectedProducts?: OfferSelectedProductDto[];
}

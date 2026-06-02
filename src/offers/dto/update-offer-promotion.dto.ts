import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Max,
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

export enum OfferAction {
  PAUSE = 'pause',
  RESUME = 'resume',
}

export class UpdateOfferPromotionDto {
  @IsOptional()
  @IsString()
  bannerTitle?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  bannerCategory?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedDates?: string[];

  @IsOptional()
  @IsString()
  recommendedSize?: string;

  @IsOptional()
  @IsEnum(OfferAction)
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
  @Min(1)
  @Max(50)
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
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferSelectedProductDto)
  selectedProducts?: OfferSelectedProductDto[];
}

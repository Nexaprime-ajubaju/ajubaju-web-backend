import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class TargetLocationDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

class OfferSelectedProductDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
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

import { BannerPromotionType } from '../schemas/banner-promotion.schema';

export enum BannerCoverageType {
  TOWN = 'Town',
  CITY = 'City',
  DISTRICT = 'District',
}

export class SubmitBannerPromotionDto {
  @IsOptional()
  @IsString()
  bannerTitle?: string;

  // Accept new API alias `title` as optional to support offers API
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  bannerCategory?: string;

  @IsOptional()
  @IsString()
  subCategory?: string;

  // Accept new API alias `category` as optional to support offers API
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(BannerPromotionType)
  promotionType?: BannerPromotionType;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(https?:\/\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/, {
    message: 'imageUrl must be a URL address or uploaded image data',
  })
  imageUrl: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(7, {
    message: 'A banner can be active for a maximum of 7 days',
  })
  selectedDates: string[];

  @IsNumber()
  @Min(0)
  totalPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @IsOptional()
  @IsString()
  recommendedSize?: string;

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
  @IsEnum(BannerCoverageType)
  coverageType?: BannerCoverageType;

  @IsOptional()
  @IsString()
  coverageRegion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCities?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TargetLocationDto)
  targetLocations?: TargetLocationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferSelectedProductDto)
  selectedProducts?: OfferSelectedProductDto[];
}

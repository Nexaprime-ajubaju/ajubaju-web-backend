import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ArrayMaxSize,
} from 'class-validator';

export class CreateMerchantProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'A maximum of 5 images are allowed' })
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;
}

// Trigger Recompile


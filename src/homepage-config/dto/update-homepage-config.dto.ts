import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HomepageSectionDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsInt()
  @Min(1, { message: 'displayOrder must be greater than 0' })
  displayOrder: number;

  @IsString()
  @IsOptional()
  strategy?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateHomepageConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HomepageSectionDto)
  sections: HomepageSectionDto[];
}

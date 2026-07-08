import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  IsLatitude,
  IsLongitude,
  IsUrl,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContactInfoDto } from './contact-info.dto';
import { MetadataDto } from './metadata.dto';

export class CreateAdDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum([
    'Education',
    'Matrimonial',
    'Vehicle',
    'Business',
    'Travel',
    'Astrology',
    'Property',
    'Public Notice',
    'Lost & Found',
    'Service',
    'Personal',
    'Employment',
    'Pets',
    'Mobiles',
    'Electronics & Home appliances',
    'Furniture',
    'Greetings & Tributes',
    'Other',
  ])
  category: string;

  @IsString()
  @IsNotEmpty()
  subCategory: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  userId: string;

  @IsEnum(['Customer', 'Admin']) // ← Should match your schema
  userType: string;

  @IsArray()
  @IsUrl({}, { each: true })
  images: string[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  videos?: string[];

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  @ValidateNested()
  @Type(() => ContactInfoDto)
  contactInfo: ContactInfoDto;

  // ==================== NEW FIELDS FROM FRONTEND ====================

  @IsOptional()
  @IsString()
  language?: string; // From frontend language selector

  @IsOptional()
  @IsString()
  primaryContact?: string; // From frontend primary contact field

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[]; // Multiple locations from frontend

  @IsOptional()
  @IsArray()
  @Type(() => Date)
  selectedDates?: Date[]; // Selected dates from scheduling

  @IsOptional()
  @IsNumber()
  templateId?: number; // Template ID for UI (1, 2, or 3)

  // For Property category
  @IsOptional()
  @IsObject()
  propertyData?: Record<string, any>;

  // For Vehicle category
  @IsOptional()
  @IsObject()
  vehicleData?: Record<string, any>;

  // For Service category
  @IsOptional()
  @IsObject()
  serviceData?: Record<string, any>;

  // For Mobile category
  @IsOptional()
  @IsObject()
  mobileData?: Record<string, any>;

  // For Electronics category
  @IsOptional()
  @IsObject()
  electronicsData?: Record<string, any>;

  // For Furniture category
  @IsOptional()
  @IsObject()
  furnitureData?: Record<string, any>;

  // For Education category
  @IsOptional()
  @IsObject()
  educationData?: Record<string, any>;

  // For Pets category
  @IsOptional()
  @IsObject()
  petsData?: Record<string, any>;

  // For Matrimonial category
  @IsOptional()
  @IsObject()
  matrimonialData?: Record<string, any>;

  // For Business category
  @IsOptional()
  @IsObject()
  businessData?: Record<string, any>;

  // For Travel category
  @IsOptional()
  @IsObject()
  travelData?: Record<string, any>;

  // For Astrology category
  @IsOptional()
  @IsObject()
  astrologyData?: Record<string, any>;

  // For Employment category
  @IsOptional()
  @IsObject()
  employmentData?: Record<string, any>;

  // For Lost & Found category
  @IsOptional()
  @IsObject()
  lostFoundData?: Record<string, any>;

  // For Personal category
  @IsOptional()
  @IsObject()
  personalData?: Record<string, any>;

  // For Public Notice category
  @IsOptional()
  @IsObject()
  publicNoticeData?: Record<string, any>;

  // For Greetings & Tributes category
  @IsOptional()
  @IsObject()
  greetingsData?: Record<string, any>;

  // For Other category (and fallback category-specific payload)
  @IsOptional()
  @IsObject()
  otherData?: Record<string, any>;

  // Generic fallback container for category-specific payload
  @IsOptional()
  @IsObject()
  categorySpecificData?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Date)
  expiryDate?: Date;

  @IsOptional()
  @IsBoolean()
  isPromoted?: boolean;

  @IsOptional()
  @Type(() => Date)
  promotedUntil?: Date;

  @IsOptional()
  @IsString()
  promotionPackage?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MetadataDto)
  metadata?: MetadataDto;
}

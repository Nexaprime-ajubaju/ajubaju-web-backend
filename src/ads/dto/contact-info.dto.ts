import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsUrl,
} from 'class-validator';

export class ContactInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsUrl()
  website?: string; // Add this field

  @IsOptional()
  @IsEnum(['phone', 'email', 'whatsapp', 'website'])
  preferredContactMethod?: string;
}

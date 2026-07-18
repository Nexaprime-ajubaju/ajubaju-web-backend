import { PartialType } from '@nestjs/mapped-types';
import { CreateAdDto } from './create-ad.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAdDto extends PartialType(CreateAdDto) {
  @IsOptional()
  @IsString()
  status?: string;
}

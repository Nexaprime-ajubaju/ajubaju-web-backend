import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  customReason?: string;

  @IsString()
  @IsNotEmpty()
  confirmation: string;
}

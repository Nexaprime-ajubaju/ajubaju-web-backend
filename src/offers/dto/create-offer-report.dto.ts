import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OfferReportReason } from '../schemas/offer-report.schema';

export class CreateOfferReportDto {
  @IsEnum(OfferReportReason)
  @IsNotEmpty()
  reason: OfferReportReason;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}

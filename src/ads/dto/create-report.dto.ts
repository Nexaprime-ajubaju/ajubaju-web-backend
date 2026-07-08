import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportReason } from '../schemas/report.schema';

export class CreateReportDto {
  @IsEnum(ReportReason, {
    message:
      'Reason must be one of: spam, inappropriate, fraud, duplicate, other',
  })
  reason: ReportReason;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;
}

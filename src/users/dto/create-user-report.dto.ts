import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  IsNumber,
} from 'class-validator';
import {
  UserReportReason,
  UserReportStatus,
} from '../schemas/user-report.schema';

export class CreateUserReportDto {
  @IsString()
  reportedUserId: string;

  @IsEnum(UserReportReason, {
    message:
      'Reason must be one of: harassment, abuse, fraud, scam, fake_account, spam, other',
  })
  reason: UserReportReason;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsArray()
  @IsOptional()
  evidenceUrls?: string[];
}

export class UpdateUserReportStatusDto {
  @IsEnum(UserReportStatus, {
    message:
      'Status must be one of: pending, under_investigation, resolved, dismissed',
  })
  status: UserReportStatus;

  @IsString()
  @IsOptional()
  adminNotes?: string;

  @IsNumber()
  @IsOptional()
  priority?: number;
}

export class QueryUserReportsDto {
  @IsOptional()
  @IsString()
  status?: UserReportStatus;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  skip?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;
}

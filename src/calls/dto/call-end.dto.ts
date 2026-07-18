import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CallEndDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsOptional()
  @IsEnum(['hangup', 'declined', 'timeout', 'network_error', 'busy', 'failed'])
  reason?:
    | 'hangup'
    | 'declined'
    | 'timeout'
    | 'network_error'
    | 'busy'
    | 'failed';
}

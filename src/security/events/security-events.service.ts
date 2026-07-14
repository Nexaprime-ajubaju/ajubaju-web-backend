import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecurityEvent, SecurityEventDocument, SecurityEventType } from '../schemas/security-event.schema';

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(
    @InjectModel(SecurityEvent.name)
    private readonly securityEventModel: Model<SecurityEventDocument>,
  ) {}

  async logEvent(params: {
    merchantId: string;
    offerId?: string;
    eventType: SecurityEventType;
    severity: string;
    message: string;
    metadata?: any;
  }) {
    try {
      this.logger.warn(`Security Event [${params.eventType}]: ${params.message}`);
      await this.securityEventModel.create(params);
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }
}

import { Controller, Logger, Optional } from '@nestjs/common';
import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';
import { VouchersService } from './vouchers.service';

@Controller()
export class VouchersKafkaController {
  private readonly logger = new Logger(VouchersKafkaController.name);

  constructor(
    private readonly vouchersService: VouchersService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private getValue(message: any) {
    return message?.value ?? message ?? {};
  }

  private getCorrelationId(message: any): string {
    return message?.headers?.correlationId || 'unknown';
  }

  private success(data: any, correlationId: string) {
    return {
      success: true,
      data,
      correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  private failure(error: any, correlationId: string) {
    return {
      success: false,
      error: {
        message: error?.message || 'Internal error',
        code: error?.code || 'INTERNAL_ERROR',
      },
      correlationId,
      timestamp: new Date().toISOString(),
    };
  }

  @MessagePattern(KAFKA_TOPICS.VOUCHER_CLAIM)
  async handleClaim(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.vouchersService.claimOffer(
        value.userId,
        value.offerId,
      );

      if (this.kafkaService && result?.success) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.VOUCHER_CLAIMED,
          {
            voucherId: result?.data?.voucherId,
            offerId: value.offerId,
            userId: value.userId,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed VOUCHER_CLAIM: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.VOUCHER_GET_MY)
  async handleGetMy(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.vouchersService.getMyVouchers(
        value.userId,
        Number(value.page || 1),
        Number(value.limit || 10),
        value.status,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed VOUCHER_GET_MY: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.VOUCHER_GET_BY_ID)
  async handleGetById(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.vouchersService.getVoucherById(
        value.voucherId,
        value.userId,
      );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed VOUCHER_GET_BY_ID: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.VOUCHER_VERIFY)
  async handleVerify(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.vouchersService.verifyVoucher(
        value.voucherId,
        value.qrCode,
        value.merchantId,
      );

      if (this.kafkaService && result?.success && result?.valid) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.VOUCHER_VERIFIED,
          {
            voucherId: value.voucherId,
            merchantId: value.merchantId,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed VOUCHER_VERIFY: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.VOUCHER_REDEEM)
  async handleRedeem(@Payload() message: any, @Ctx() context: KafkaContext) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result = await this.vouchersService.redeemVoucher(
        value.voucherId,
        value.qrCode,
        value.merchantId,
        value.verificationCode,
      );

      if (this.kafkaService && result?.success) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.VOUCHER_REDEEMED,
          {
            voucherId: result?.data?.voucherId,
            merchantId: value.merchantId,
            redeemedAt: result?.data?.redeemedAt,
            redemptionCode: result?.data?.redemptionCode,
          },
          correlationId,
        );
      }

      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed VOUCHER_REDEEM: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }

  @MessagePattern(KAFKA_TOPICS.VOUCHER_GENERATE_CODE)
  async handleGenerateCode(
    @Payload() message: any,
    @Ctx() context: KafkaContext,
  ) {
    const value = this.getValue(message);
    const correlationId = this.getCorrelationId(message);

    try {
      const result =
        await this.vouchersService.generateVerificationCodeForVoucher(
          value.voucherId,
          value.merchantId,
        );
      return this.success(result, correlationId);
    } catch (error) {
      this.logger.error(`Failed VOUCHER_GENERATE_CODE: ${error.message}`);
      return this.failure(error, correlationId);
    }
  }
}

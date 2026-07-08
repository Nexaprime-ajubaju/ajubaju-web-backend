import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Razorpay = require('razorpay');
import { createHmac, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { MarkPaymentFailedDto } from './dto/mark-payment-failed.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
} from './schemas/payment.schema';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { TransactionService } from '../common/services/transaction.service';

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly razorpayKeyId: string | null;
  private readonly razorpayKeySecret: string | null;
  private readonly webhookSecret: string | null;
  private readonly razorpay: Razorpay | null;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    private configService: ConfigService,
    private readonly transactionService: TransactionService,
    @Optional() private kafkaService?: KafkaService,
  ) {
    this.razorpayKeyId =
      this.configService.get<string>('RAZORPAY_KEY_ID') || null;
    this.razorpayKeySecret =
      this.configService.get<string>('RAZORPAY_KEY_SECRET') || null;
    this.webhookSecret =
      this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || null;

    if (this.razorpayKeyId && this.razorpayKeySecret) {
      this.razorpay = new Razorpay({
        key_id: this.razorpayKeyId,
        key_secret: this.razorpayKeySecret,
      });
    } else {
      this.razorpay = null;
      this.logger.warn(
        'Razorpay keys missing. Payment endpoints will not be functional.',
      );
    }
  }

  async onModuleInit() {
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for PaymentsService');
    }
  }

  private ensureGateway(): Razorpay {
    if (!this.razorpay || !this.razorpayKeyId || !this.razorpayKeySecret) {
      throw new InternalServerErrorException(
        'Payment gateway is not configured.',
      );
    }
    return this.razorpay;
  }

  private toPublicPayment(payment: PaymentDocument | null) {
    if (!payment) return null;

    return {
      paymentId: payment.paymentId,
      userId: payment.userId,
      adId: payment.adId,
      amount: payment.amount,
      amountInPaise: payment.amountInPaise,
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      receipt: payment.receipt,
      description: payment.description,
      notes: payment.notes || {},
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      refundedAmountInPaise: payment.refundedAmountInPaise,
      refunds: payment.refunds || [],
      method: payment.method,
      failureCode: payment.failureCode,
      failureDescription: payment.failureDescription,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const gateway = this.ensureGateway();

    if (dto.idempotencyKey) {
      const existing = await this.paymentModel
        .findOne({ userId, idempotencyKey: dto.idempotencyKey })
        .exec();

      if (existing) {
        return {
          reused: true,
          keyId: this.razorpayKeyId,
          payment: this.toPublicPayment(existing),
        };
      }
    }

    const amountInPaise = Math.round(dto.amount * 100);
    if (amountInPaise < 100) {
      throw new BadRequestException('Minimum payment amount is ₹1.00');
    }

    const currency = (dto.currency || 'INR').toUpperCase();
    const receipt =
      dto.receipt || `golo_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const order = await gateway.orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes: dto.notes || {},
    });

    const payment = await this.transactionService.execute(async (session) => {
      const createdPayment = await this.paymentModel.create(
        [
          {
            paymentId: randomUUID(),
            userId,
            adId: dto.adId,
            amount: dto.amount,
            amountInPaise,
            currency,
            provider: 'razorpay',
            status: PaymentStatus.CREATED,
            receipt,
            description: dto.description,
            notes: dto.notes || {},
            idempotencyKey: dto.idempotencyKey,
            razorpayOrderId: order.id,
            metadata: {
              orderResponse: order,
            },
          },
        ],
        { session },
      );
      return createdPayment[0];
    });

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.PAYMENT_CREATED, {
        paymentId: payment.paymentId,
        userId,
        amount: payment.amount,
        currency: payment.currency,
        razorpayOrderId: payment.razorpayOrderId,
      });
    }

    return {
      keyId: this.razorpayKeyId,
      order,
      payment: this.toPublicPayment(payment),
    };
  }

  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    this.ensureGateway();

    const payment = await this.paymentModel
      .findOne({ userId, razorpayOrderId: dto.razorpayOrderId })
      .exec();

    if (!payment) {
      throw new NotFoundException('Payment order not found for this user.');
    }

    const expectedSignature = createHmac('sha256', this.razorpayKeySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    const provided = Buffer.from(dto.razorpaySignature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      payment.status = PaymentStatus.FAILED;
      payment.failureDescription =
        'Signature mismatch during payment verification';
      payment.razorpayPaymentId = dto.razorpayPaymentId;
      payment.razorpaySignature = dto.razorpaySignature;
      await payment.save();
      throw new BadRequestException('Invalid Razorpay signature.');
    }

    payment.razorpayPaymentId = dto.razorpayPaymentId;
    payment.razorpaySignature = dto.razorpaySignature;

    try {
      const gatewayPayment = await this.razorpay.payments.fetch(
        dto.razorpayPaymentId,
      );
      payment.method = gatewayPayment.method;
      payment.metadata = {
        ...(payment.metadata || {}),
        verificationResponse: gatewayPayment,
      };

      payment.status =
        gatewayPayment.status === 'captured'
          ? PaymentStatus.CAPTURED
          : PaymentStatus.AUTHORIZED;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch payment from Razorpay after signature verification: ${error.message}`,
      );
      payment.status = PaymentStatus.AUTHORIZED;
    }

    await payment.save();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.PAYMENT_SUCCEEDED, {
        paymentId: payment.paymentId,
        userId,
        status: payment.status,
        amount: payment.amount,
        razorpayPaymentId: payment.razorpayPaymentId,
      });
    }

    return {
      message: 'Payment verified successfully',
      payment: this.toPublicPayment(payment),
    };
  }

  async markPaymentFailed(userId: string, dto: MarkPaymentFailedDto) {
    if (!dto.razorpayOrderId && !dto.razorpayPaymentId) {
      throw new BadRequestException(
        'Provide razorpayOrderId or razorpayPaymentId',
      );
    }

    const query: any = { userId };
    if (dto.razorpayOrderId) query.razorpayOrderId = dto.razorpayOrderId;
    if (dto.razorpayPaymentId) query.razorpayPaymentId = dto.razorpayPaymentId;

    const payment = await this.paymentModel.findOne(query).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found for this user.');
    }

    payment.status = PaymentStatus.FAILED;
    payment.failureCode = dto.failureCode;
    payment.failureDescription =
      dto.failureDescription || 'Payment failed at gateway';
    await payment.save();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.PAYMENT_FAILED, {
        paymentId: payment.paymentId,
        userId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        failureCode: payment.failureCode,
      });
    }

    return {
      message: 'Payment marked as failed',
      payment: this.toPublicPayment(payment),
    };
  }

  async refundPayment(userId: string, dto: RefundPaymentDto) {
    const gateway = this.ensureGateway();

    const payment = await this.paymentModel
      .findOne({ paymentId: dto.paymentId, userId })
      .exec();
    if (!payment) {
      throw new NotFoundException('Payment not found for this user.');
    }

    if (!payment.razorpayPaymentId) {
      throw new BadRequestException(
        'Cannot refund because captured payment reference is missing.',
      );
    }

    const refundableBalance =
      payment.amountInPaise - (payment.refundedAmountInPaise || 0);
    if (refundableBalance <= 0) {
      throw new BadRequestException('Payment is already fully refunded.');
    }

    const refundAmountInPaise = dto.amount
      ? Math.round(dto.amount * 100)
      : refundableBalance;

    if (refundAmountInPaise <= 0 || refundAmountInPaise > refundableBalance) {
      throw new BadRequestException('Invalid refund amount.');
    }

    const refund = await gateway.payments.refund(payment.razorpayPaymentId, {
      amount: refundAmountInPaise,
      notes: {
        reason: dto.reason || 'Requested by user',
      },
    });

    payment.refunds = payment.refunds || [];
    payment.refunds.push({
      refundId: refund.id,
      amountInPaise: refundAmountInPaise,
      status: refund.status,
      reason: dto.reason,
      createdAt: new Date(),
    });

    payment.refundedAmountInPaise =
      (payment.refundedAmountInPaise || 0) + refundAmountInPaise;
    payment.status =
      payment.refundedAmountInPaise >= payment.amountInPaise
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;

    payment.metadata = {
      ...(payment.metadata || {}),
      lastRefundResponse: refund,
    };

    await payment.save();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.PAYMENT_REFUNDED, {
        paymentId: payment.paymentId,
        userId,
        refundId: refund.id,
        refundedAmountInPaise: refundAmountInPaise,
        totalRefundedAmountInPaise: payment.refundedAmountInPaise,
      });
    }

    return {
      message: 'Refund initiated successfully',
      refund,
      payment: this.toPublicPayment(payment),
    };
  }

  async getPaymentById(userId: string, paymentId: string) {
    const payment = await this.paymentModel
      .findOne({ userId, paymentId })
      .exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.toPublicPayment(payment);
  }

  async listMyPayments(userId: string, query: ListPaymentsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: any = { userId };
    if (query.status) {
      filter.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => this.toPublicPayment(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async handleWebhook(rawBody: string, signature: string) {
    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'Razorpay webhook secret is not configured.',
      );
    }

    if (!signature) {
      throw new BadRequestException('Missing Razorpay webhook signature.');
    }

    const expectedSignature = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const provided = Buffer.from(signature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody || '{}');
    const eventId = event?.event || 'unknown_event';
    const paymentEntity = event?.payload?.payment?.entity;

    if (!paymentEntity) {
      return { acknowledged: true };
    }

    const payment = await this.paymentModel
      .findOne({
        $or: [
          { razorpayPaymentId: paymentEntity.id },
          { razorpayOrderId: paymentEntity.order_id },
        ],
      })
      .exec();

    if (!payment) {
      return { acknowledged: true };
    }

    if (payment.processedWebhookEventIds?.includes(eventId)) {
      return { acknowledged: true, duplicate: true };
    }

    await this.transactionService.execute(async (session) => {
      const freshPayment = await this.paymentModel
        .findOne({ _id: payment._id })
        .session(session)
        .exec();
      if (!freshPayment) {
        throw new NotFoundException('Payment not found');
      }

      if (freshPayment.processedWebhookEventIds?.includes(eventId)) {
        return { acknowledged: true, duplicate: true };
      }

      freshPayment.processedWebhookEventIds =
        freshPayment.processedWebhookEventIds || [];
      freshPayment.processedWebhookEventIds.push(eventId);

      freshPayment.razorpayPaymentId =
        paymentEntity.id || freshPayment.razorpayPaymentId;
      freshPayment.method = paymentEntity.method || freshPayment.method;

      if (event.event === 'payment.captured') {
        freshPayment.status = PaymentStatus.CAPTURED;
      } else if (event.event === 'payment.failed') {
        freshPayment.status = PaymentStatus.FAILED;
        freshPayment.failureCode = paymentEntity.error_code;
        freshPayment.failureDescription = paymentEntity.error_description;
      }

      freshPayment.metadata = {
        ...(freshPayment.metadata || {}),
        lastWebhookEvent: event,
      };

      await freshPayment.save({ session });
      return freshPayment;
    });

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.PAYMENT_WEBHOOK_PROCESSED, {
        paymentId: payment.paymentId,
        userId: payment.userId,
        event: event.event,
        razorpayPaymentId: payment.razorpayPaymentId,
      });
    }

    return { acknowledged: true };
  }
}

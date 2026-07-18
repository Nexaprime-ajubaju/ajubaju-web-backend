import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { MarkPaymentFailedDto } from './dto/mark-payment-failed.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const data = await this.paymentsService.createOrder(user.id, dto);
    return {
      success: true,
      message: 'Razorpay order created successfully',
      data,
    };
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(@CurrentUser() user: any, @Body() dto: VerifyPaymentDto) {
    const data = await this.paymentsService.verifyPayment(user.id, dto);
    return {
      success: true,
      message: 'Payment verified successfully',
      data,
    };
  }

  @Post('fail')
  @UseGuards(JwtAuthGuard)
  async markPaymentFailed(
    @CurrentUser() user: any,
    @Body() dto: MarkPaymentFailedDto,
  ) {
    const data = await this.paymentsService.markPaymentFailed(user.id, dto);
    return {
      success: true,
      message: 'Payment marked as failed',
      data,
    };
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard)
  async refundPayment(@CurrentUser() user: any, @Body() dto: RefundPaymentDto) {
    const data = await this.paymentsService.refundPayment(user.id, dto);
    return {
      success: true,
      message: 'Refund initiated successfully',
      data,
    };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async listMyPayments(
    @CurrentUser() user: any,
    @Query() query: ListPaymentsQueryDto,
  ) {
    const data = await this.paymentsService.listMyPayments(user.id, query);
    return {
      success: true,
      data,
    };
  }

  @Get(':paymentId')
  @UseGuards(JwtAuthGuard)
  async getPaymentById(
    @CurrentUser() user: any,
    @Param('paymentId') paymentId: string,
  ) {
    const data = await this.paymentsService.getPaymentById(user.id, paymentId);
    return {
      success: true,
      data,
    };
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody =
      req.rawBody?.toString('utf8') || JSON.stringify(req.body || {});
    const data = await this.paymentsService.handleWebhook(rawBody, signature);

    return {
      success: true,
      data,
    };
  }
}

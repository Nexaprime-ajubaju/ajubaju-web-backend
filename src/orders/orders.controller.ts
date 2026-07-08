import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { OrderStatus } from './schemas/order.schema';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('merchant')
  async getMerchantOrders(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    const merchantId = user?.id || user?._id;
    return this.ordersService.getMerchantOrders(
      merchantId,
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get('merchant/stats')
  async getMerchantOrderStats(@CurrentUser() user: any) {
    const merchantId = user?.id || user?._id;
    return this.ordersService.getMerchantOrderStats(merchantId);
  }

  @Patch(':orderId/status')
  async updateOrderStatus(
    @CurrentUser() user: any,
    @Param('orderId') orderId: string,
    @Body('status') status: OrderStatus,
  ) {
    const merchantId = user?.id || user?._id;
    return this.ordersService.updateOrderStatus(merchantId, orderId, status);
  }
}

import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('wallets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('balance')
  @Roles(UserRole.USER, UserRole.MERCHANT)
  async getBalance(@Req() req) {
    const userType = req.user?.role === UserRole.MERCHANT ? 'merchant' : 'user';
    
    // For merchant, req.user._id is usually the User document ID. The Merchant document uses userId = User._id.
    // Ensure we pass the right ID. If req.user is the User doc, userId is req.user._id
    const idToUse = (req.user?.id || req.user?._id).toString();

    const balance = await this.walletsService.getBalance(idToUse, userType);
    return { balance };
  }

  @Get('transactions')
  @Roles(UserRole.USER, UserRole.MERCHANT)
  async getTransactions(@Req() req) {
    const userType = req.user?.role === UserRole.MERCHANT ? 'merchant' : 'user';
    const idToUse = (req.user?.id || req.user?._id).toString();

    const transactions = await this.walletsService.getTransactions(idToUse, userType);
    return { transactions };
  }

  @Post('debit')
  @Roles(UserRole.USER, UserRole.MERCHANT)
  async debitWallet(@Req() req, @Body() body: { amount: number; description: string; referenceId?: string; referenceType?: string }) {
    const userType = req.user?.role === UserRole.MERCHANT ? 'merchant' : 'user';
    const idToUse = (req.user?.id || req.user?._id).toString();

    if (!body.amount || body.amount <= 0) {
      return { success: false, message: 'Invalid amount' };
    }

    const newBalance = await this.walletsService.debit(idToUse, userType, body.amount, body.description, body.referenceId, body.referenceType);
    return { success: true, balance: newBalance };
  }
}

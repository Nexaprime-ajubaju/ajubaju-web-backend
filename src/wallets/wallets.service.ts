import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletTransaction, WalletTransactionDocument } from './schemas/wallet-transaction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';

@Injectable()
export class WalletsService {
  constructor(
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Merchant.name) private merchantModel: Model<MerchantDocument>,
  ) {}

  async getBalance(userId: string, userType: 'user' | 'merchant'): Promise<number> {
    if (userType === 'user') {
      const user = await this.userModel.findById(userId);
      if (!user) throw new NotFoundException('User not found');
      return user.walletBalance || 0;
    } else {
      const merchant = await this.merchantModel.findOne({ userId });
      if (!merchant) throw new NotFoundException('Merchant not found');
      return merchant.walletBalance || 0;
    }
  }

  async getTransactions(userId: string, userType: 'user' | 'merchant') {
    return this.transactionModel.find({ userId, userType }).sort({ createdAt: -1 }).exec();
  }

  async credit(userId: string, userType: 'user' | 'merchant', amount: number, description: string, referenceId?: string, referenceType?: string) {
    if (amount <= 0) return null;

    const transaction = new this.transactionModel({
      userId,
      userType,
      type: 'credit',
      amount,
      description,
      referenceId,
      referenceType,
      status: 'completed',
    });

    await transaction.save();

    if (userType === 'user') {
      await this.userModel.findByIdAndUpdate(userId, { $inc: { walletBalance: amount } });
    } else {
      await this.merchantModel.findOneAndUpdate({ userId }, { $inc: { walletBalance: amount } });
    }

    return transaction;
  }

  async debit(userId: string, userType: 'user' | 'merchant', amount: number, description: string, referenceId?: string, referenceType?: string) {
    if (amount <= 0) return null;

    const currentBalance = await this.getBalance(userId, userType);
    if (currentBalance < amount) {
      throw new Error('Insufficient wallet balance');
    }

    const transaction = new this.transactionModel({
      userId,
      userType,
      type: 'debit',
      amount,
      description,
      referenceId,
      referenceType,
      status: 'completed',
    });

    await transaction.save();

    if (userType === 'user') {
      await this.userModel.findByIdAndUpdate(userId, { $inc: { walletBalance: -amount } });
    } else {
      await this.merchantModel.findOneAndUpdate({ userId }, { $inc: { walletBalance: -amount } });
    }

    return transaction;
  }
}

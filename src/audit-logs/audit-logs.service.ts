import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionService } from '../common/services/transaction.service';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    private readonly transactionService: TransactionService,
  ) {}

  async log(data: {
    action: string;
    adminId: string;
    adminEmail: string;
    targetId: string;
    targetType: 'Ad' | 'User' | 'Report';
    details?: any;
  }) {
    return this.transactionService.execute(async (session) => {
      const newLog = new this.auditLogModel({
        ...data,
        createdAt: new Date(),
      });
      return newLog.save({ session });
    });
  }

  async getAllLogs(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(),
    ]);
    return { logs, total };
  }
}

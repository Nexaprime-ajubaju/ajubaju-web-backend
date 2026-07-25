import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportTicket, SupportTicketDocument } from './schemas/support-ticket.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
  ) {}

  private generateTicketId(): string {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `TKT-${random}`;
  }

  async create(createDto: CreateTicketDto): Promise<SupportTicket> {
    const ticketId = this.generateTicketId();
    
    // Automatically determine priority based on issue type (simple logic)
    let priority = 'Medium';
    if (createDto.issueType.toLowerCase().includes('billing') || createDto.issueType.toLowerCase().includes('payment')) priority = 'High';
    if (createDto.issueType.toLowerCase().includes('security') || createDto.issueType.toLowerCase().includes('scam')) priority = 'Critical';
    
    const newTicket = new this.ticketModel({
      ...createDto,
      ticketId,
      priority,
      status: 'Open',
      userId: createDto.userId ? new Types.ObjectId(createDto.userId) : null
    });

    return newTicket.save();
  }

  async findAll(page: number = 1, limit: number = 10, status?: string): Promise<{ data: SupportTicket[], total: number }> {
    const query: any = {};
    if (status && status !== 'All') {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    
    const [data, total] = await Promise.all([
      this.ticketModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.ticketModel.countDocuments(query).exec()
    ]);

    return { data, total };
  }

  async findOne(id: string): Promise<SupportTicket> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    return ticket;
  }

  async updateStatus(id: string, updateData: { status?: string, priority?: string, adminNotes?: string, newMessage?: { by: string, text: string } }): Promise<SupportTicket> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    if (updateData.status) ticket.status = updateData.status;
    if (updateData.priority) ticket.priority = updateData.priority;
    if (updateData.adminNotes !== undefined) ticket.adminNotes = updateData.adminNotes;
    
    if (updateData.newMessage) {
      ticket.chatHistory.push({
        by: updateData.newMessage.by,
        text: updateData.newMessage.text,
        timestamp: new Date()
      });
    }

    return ticket.save();
  }
}

import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  create(@Body() createDto: CreateTicketDto) {
    return this.supportTicketsService.create(createDto);
  }

  // Admin routes - in a real app, these should be protected by JwtAuthGuard and RolesGuard
  @Get()
  findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string
  ) {
    return this.supportTicketsService.findAll(+page, +limit, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supportTicketsService.findOne(id);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() updateData: { status?: string, priority?: string, adminNotes?: string, newMessage?: { by: string, text: string } }
  ) {
    return this.supportTicketsService.updateStatus(id, updateData);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatsService } from './chats.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post('start')
  async startConversation(
    @CurrentUser() user: any,
    @Body() dto: StartConversationDto,
  ) {
    const data = await this.chatsService.startConversation(user.id, dto);
    return {
      success: true,
      message: 'Conversation ready',
      data,
    };
  }

  @Get('conversations')
  async listConversations(@CurrentUser() user: any) {
    const data = await this.chatsService.listConversations(user.id);
    return {
      success: true,
      data,
    };
  }

  @Get('conversations/:conversationId/messages')
  async listMessages(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesDto,
  ) {
    const data = await this.chatsService.listMessages(
      user.id,
      conversationId,
      query,
    );
    return {
      success: true,
      data,
    };
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.chatsService.sendMessage(
      user.id,
      conversationId,
      dto,
    );
    return {
      success: true,
      data,
    };
  }

  @Delete('conversations/:conversationId')
  async deleteConversation(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    await this.chatsService.deleteConversation(user.id, conversationId);
    return {
      success: true,
      message: 'Conversation deleted successfully',
    };
  }
}

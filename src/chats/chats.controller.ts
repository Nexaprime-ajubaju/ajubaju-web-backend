import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
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

  @Post('upload/image')
  @UseInterceptors(AnyFilesInterceptor())
  async uploadImage(@UploadedFiles() files: any[]) {
    try {
      const file = files?.[0];
      if (!file) {
        return {
          success: false,
          message: 'No image file provided',
        };
      }
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dcm1plq42';
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      let secureUrl = '';
      if (apiKey && apiSecret) {
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });

        secureUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'golo/chat-images' },
            (error: any, result: any) => {
              if (error) return reject(error);
              resolve(result.secure_url);
            },
          );
          uploadStream.end(file.buffer);
        });
      } else {
        const FormData = require('form-data');
        const axios = require('axios');
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname || 'upload.jpg',
          contentType: file.mimetype || 'image/jpeg',
        });
        formData.append(
          'upload_preset',
          process.env.CLOUDINARY_UPLOAD_PRESET || 'choja_preset',
        );
        formData.append('folder', 'golo/chat-images');

        const response = await axios.post(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          formData,
          { headers: formData.getHeaders() },
        );
        secureUrl = response.data?.secure_url || '';
      }

      return {
        success: true,
        message: 'Image uploaded successfully',
        data: {
          url: secureUrl,
          secure_url: secureUrl,
          imageUrl: secureUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to upload image',
      };
    }
  }

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

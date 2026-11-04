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

import { ChatsGateway } from './chats.gateway';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly chatsGateway: ChatsGateway,
  ) {}

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
      let secureUrl = '';

      // 1. Cloudflare R2 Primary Upload
      if (
        process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
      ) {
        try {
          const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
          const s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
              secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            },
          });
          const cleanName = (file.originalname || 'chat_image.jpg')
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_');
          const ext = (file.originalname || 'chat_image.jpg').split('.').pop() || 'jpg';
          const key = `chats/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanName}.${ext}`;
          const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'ajubaju-29-10';

          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype || 'image/jpeg',
            }),
          );

          const publicUrl = (
            process.env.CLOUDFLARE_R2_PUBLIC_URL ||
            process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ||
            ''
          ).trim().replace(/\/+$/, '');
          secureUrl = publicUrl ? `${publicUrl}/${key}` : `/api/media/file/${key}`;
        } catch (r2Err: any) {
          console.error(`Cloudflare R2 chat upload failed: ${r2Err.message}`);
          return {
            success: false,
            message: `Failed to upload image to Cloudflare R2: ${r2Err.message}`,
          };
        }
      } else {
        return {
          success: false,
          message: 'Cloudflare R2 storage credentials are not configured.',
        };
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

    this.chatsGateway.broadcastNewMessage(user.id, conversationId, data);

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

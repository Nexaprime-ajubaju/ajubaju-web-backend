// ...existing code...
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  Logger,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { KafkaService } from '../kafka/kafka.service';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../users/schemas/user.schema';
import { Optional } from '@nestjs/common';

@Controller('ads')
export class AdsController {
  private readonly logger = new Logger(AdsController.name);

  constructor(
    private readonly adsService: AdsService,
    @Optional() private readonly kafkaService?: KafkaService,
  ) { }

  /**
   * Admin: Get real-time listing report stats for admin panel cards
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('reports/stats')
  async getListingReportStats() {
    // Real-time stats for admin panel cards
    const stats = await this.adsService.getReportStats();
    return {
      success: true,
      data: stats,
    };
  }

  // ==================== PUBLIC ROUTES (No Auth Required) ====================

  /**
   * Get all ads with pagination (CACHED)
   */
  @Get()
  async getAllAds(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Generate cache key
    const cacheKey = this.adsService.getCacheKey(
      'ads:homepage',
      pageNum,
      limitNum,
      category || 'all',
    );

    // Try cache first
    const cached = await this.adsService.redisService.get<any>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    this.logger.log(`REST: Getting all ads - Page: ${page}, Limit: ${limit}`);

    try {
      let result;
      if (category) {
        result = await this.adsService.getAdsByCategory(
          category,
          pageNum,
          limitNum,
          sortBy || 'createdAt',
          sortOrder || 'desc',
        );
      } else {
        result = await this.adsService.searchAds(
          '',
          {},
          pageNum,
          limitNum,
          sortBy || 'createdAt',
          sortOrder || 'desc',
        );
      }

      const response = {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };

      // Cache for 5 minutes
      await this.adsService.redisService.set(cacheKey, response, 300);
      return response;
    } catch (error) {
      this.logger.error(`REST: Error getting ads: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get ads',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Search ads with filters
   */
  @Get('search')
  async searchAds(
    @Query('q') query: string = '',
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(
      `REST: Searching ads with query: ${query}, sortBy: ${sortBy}`,
    );

    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const latitude = lat ? parseFloat(lat) : undefined;
      const longitude = lng ? parseFloat(lng) : undefined;

      const filters = {
        category,
        location,
        minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
        maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      };

      const result = await this.adsService.searchAds(
        query,
        filters,
        pageNum,
        limitNum,
        sortBy || 'createdAt',
        sortOrder || 'desc',
        latitude,
        longitude,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error searching ads: ${error.message}`);

      return {
        success: false,
        message: 'Failed to search ads',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get nearby ads by location
   */
  @Get('nearby')
  async getNearbyAds(
    @Query('lat') latitude: string,
    @Query('lng') longitude: string,
    @Query('distance') distance: string = '10000',
    @Query('category') category?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(`REST: Getting nearby ads at (${latitude}, ${longitude})`);

    try {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const maxDistance = parseInt(distance, 10);
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const result = await this.adsService.getNearbyAds(
        lat,
        lng,
        maxDistance,
        category,
        pageNum,
        limitNum,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error getting nearby ads: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get nearby ads',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get ads by category (CACHED)
   */
  @Get('category/:category')
  async getAdsByCategory(
    @Param('category') category: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Generate cache key
    const cacheKey = this.adsService.getCacheKey(
      'ads:category',
      category,
      pageNum,
      limitNum,
    );

    // Try cache first
    const cached = await this.adsService.redisService.get<any>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    this.logger.log(`REST: Getting ads by category: ${category}`);

    try {
      const result = await this.adsService.getAdsByCategory(
        category,
        pageNum,
        limitNum,
        sortBy || 'createdAt',
        sortOrder || 'desc',
      );

      const response = {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };

      // Cache for 10 minutes
      await this.adsService.redisService.set(cacheKey, response, 600);
      return response;
    } catch (error) {
      this.logger.error(
        `REST: Error getting ads by category: ${error.message}`,
      );

      return {
        success: false,
        message: 'Failed to get ads by category',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get promoted ads
   */
  @Get('promoted/all')
  async getPromotedAds(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log('REST: Getting promoted ads');

    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const result = await this.adsService.searchAds('', {}, pageNum, limitNum);

      const promotedAds = result.ads.filter(
        (ad) => ad.isPromoted && ad.promotedUntil > new Date(),
      );

      return {
        success: true,
        data: promotedAds,
        pagination: {
          total: promotedAds.length,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(promotedAds.length / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error getting promoted ads: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get promoted ads',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get ads statistics
   */
  @Get('stats/overview')
  async getAdsStatistics() {
    this.logger.log('REST: Getting ads statistics');

    try {
      const totalAds = await this.adsService.searchAds('', {}, 1, 1);

      const categories = [
        'Education',
        'Matrimonial',
        'Vehicle',
        'Business',
        'Travel',
        'Astrology',
        'Property',
        'Public Notice',
        'Lost & Found',
        'Service',
        'Personal',
        'Employment',
        'Pets',
        'Mobiles',
        'Electronics & Home appliances',
        'Furniture',
        'Other',
      ];

      const categoryStats = await Promise.all(
        categories.map(async (category) => {
          const result = await this.adsService.getAdsByCategory(category, 1, 1);
          return {
            category,
            count: result.total,
          };
        }),
      );

      return {
        success: true,
        data: {
          totalAds: totalAds.total,
          activeAds: totalAds.total,
          promotedAds: 0,
          categoryDistribution: categoryStats,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error getting statistics: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get statistics',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get category management data for admin dashboard page
   */
  @Get('stats/category-management')
  async getCategoryManagementStats(@Query('limit') limit: string = '12') {
    this.logger.log('REST: Getting category management stats');

    try {
      const data = await this.adsService.getCategoryManagementPublic(
        parseInt(limit, 10),
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `REST: Error getting category management stats: ${error.message}`,
      );

      return {
        success: false,
        message: 'Failed to get category management stats',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health/status')
  healthCheck() {
    return {
      status: 'healthy',
      service: 'ads-microservice',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Upload image endpoint (supports multipart/form-data)
   */
  @Post('upload/image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async uploadImage(@UploadedFiles() files: any[]) {
    this.logger.log('REST: Uploading image');
    try {
      const file = files?.[0];
      if (!file) {
        return {
          success: false,
          message: 'No image file provided',
        };
      }
      const secureUrl = await this.adsService.uploadImageToCloudinary(file);
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
      this.logger.error(`REST: Error uploading image: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Failed to upload image',
      };
    }
  }

  // ==================== USER ROUTES (Any logged-in user) ====================

  /**
   * Create a new ad (Authenticated users only)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async createAd(@Body() createAdDto: CreateAdDto, @CurrentUser() user: any) {
    this.logger.log(`REST: Creating new ad for user: ${user.id}`);

    // Enforce banUntil: block ad posting if user is suspended
    if (
      user.isBanned &&
      user.banUntil &&
      new Date(user.banUntil) > new Date()
    ) {
      const until = new Date(user.banUntil);
      const daysLeft = Math.ceil(
        (until.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      this.logger.warn(
        `Ad creation blocked - user is suspended until ${until.toISOString()}: ${user.email}`,
      );
      return {
        success: false,
        message: `You are suspended from posting ads until ${until.toLocaleDateString()} (${daysLeft} day(s) left). Reason: ${user.banReason || 'No reason provided'}`,
        error: 'User suspended',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Always enforce userId from authenticated user
      createAdDto.userId = user.id;
      createAdDto.userType = user.role === 'admin' ? 'Admin' : 'Customer';

      const ad = await this.adsService.createAd(createAdDto);

      // Emit event to Kafka
      await this.adsService.emitAdCreated(ad, uuidv4());

      // Invalidate ads cache
      await this.adsService.invalidateAdsCache();

      return {
        success: true,
        message: 'Ad created successfully',
        data: ad,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error creating ad: ${error.message}`);

      return {
        success: false,
        message: 'Failed to create ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Create ad via Kafka (async) - Authenticated users only
   */
  @Post('async')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  async createAdAsync(
    @Body() createAdDto: CreateAdDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `REST: Sending async ad creation request for user: ${user.id}`,
    );

    // Always enforce userId from authenticated user
    createAdDto.userId = user.id;
    createAdDto.userType = user.role === 'admin' ? 'Admin' : 'Customer';

    const correlationId = uuidv4();

    try {
      if (!this.kafkaService) {
        return {
          success: false,
          message: 'Kafka is disabled on server',
          timestamp: new Date().toISOString(),
        };
      }

      await this.kafkaService.send(
        KAFKA_TOPICS.AD_CREATE,
        createAdDto,
        correlationId,
      );

      return {
        success: true,
        message: 'Ad creation request submitted successfully',
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `REST: Error sending async ad creation: ${error.message}`,
      );

      return {
        success: false,
        message: 'Failed to submit ad creation request',
        error: error.message,
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get analytics for ads posted by the current user
   */
  @Get('analytics/my')
  @UseGuards(JwtAuthGuard)
  async getMyAnalytics(@CurrentUser() user: any) {
    this.logger.log(`REST: Getting analytics for user: ${user.id}`);
    try {
      const analytics = await this.adsService.getMyAnalytics(user.id);
      return { success: true, data: analytics };
    } catch (error) {
      this.logger.error(`REST: Error getting analytics: ${error.message}`);
      return { success: false, message: 'Failed to get analytics' };
    }
  }

  /**
   * Get ads by current user
   */
  @Get('user/me')
  @UseGuards(JwtAuthGuard)
  async getMyAds(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(`REST: Getting ads for current user: ${user.id}`);

    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const result = await this.adsService.getAdsByUser(
        user.id,
        pageNum,
        limitNum,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error getting user ads: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get your ads',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get ads by specific user (public - anyone can view)
   */
  @Get('user/:userId')
  async getAdsByUser(
    @Param('userId') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    this.logger.log(`REST: Getting ads by user: ${userId}`);

    try {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const result = await this.adsService.getAdsByUser(
        userId,
        pageNum,
        limitNum,
      );

      return {
        success: true,
        data: result.ads,
        pagination: {
          total: result.total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error getting ads by user: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get ads by user',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Update ad (Authenticated users only - can only update their own)
   */
  @Put(':adId')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateAd(
    @Param('adId') adId: string,
    @Body() updateData: UpdateAdDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`REST: Updating ad: ${adId} by user: ${user.id}`);

    try {
      // Users can only update their own ads (handled in service)
      const updatedAd = await this.adsService.updateAd(
        adId,
        user.id,
        updateData,
      );

      // Emit update event
      await this.adsService.emitAdUpdated(updatedAd, uuidv4());

      // Invalidate ads cache
      await this.adsService.invalidateAdsCache();

      return {
        success: true,
        message: 'Ad updated successfully',
        data: updatedAd,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error updating ad: ${error.message}`);

      return {
        success: false,
        message: 'Failed to update ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Update ad via Kafka (async) - Authenticated users only
   */
  @Put(':adId/async')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  async updateAdAsync(
    @Param('adId') adId: string,
    @Body() updateData: UpdateAdDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`REST: Sending async update request for ad: ${adId}`);

    const correlationId = uuidv4();

    try {
      if (!this.kafkaService) {
        return {
          success: false,
          message: 'Kafka is disabled on server',
          timestamp: new Date().toISOString(),
        };
      }

      await this.kafkaService.send(
        KAFKA_TOPICS.AD_UPDATE,
        {
          adId,
          userId: user.id,
          updateData,
        },
        correlationId,
      );

      return {
        success: true,
        message: 'Ad update request submitted successfully',
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error sending async update: ${error.message}`);

      return {
        success: false,
        message: 'Failed to submit ad update request',
        error: error.message,
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Delete ad (Authenticated users only - can only delete their own)
   */
  @Delete(':adId')
  @UseGuards(JwtAuthGuard)
  async deleteAd(@Param('adId') adId: string, @CurrentUser() user: any) {
    this.logger.log(`REST: Deleting ad: ${adId} by user: ${user.id}`);

    try {
      await this.adsService.deleteAd(adId, user.id);

      // Emit delete event
      await this.adsService.emitAdDeleted(adId, user.id, uuidv4());

      // Invalidate ads cache
      await this.adsService.invalidateAdsCache();

      return {
        success: true,
        message: 'Ad deleted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error deleting ad: ${error.message}`);

      return {
        success: false,
        message: 'Failed to delete ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Delete ad via Kafka (async) - Authenticated users only
   */
  @Delete(':adId/async')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  async deleteAdAsync(@Param('adId') adId: string, @CurrentUser() user: any) {
    this.logger.log(`REST: Sending async delete request for ad: ${adId}`);

    const correlationId = uuidv4();

    try {
      if (!this.kafkaService) {
        return {
          success: false,
          message: 'Kafka is disabled on server',
          timestamp: new Date().toISOString(),
        };
      }

      await this.kafkaService.send(
        KAFKA_TOPICS.AD_DELETE,
        { adId, userId: user.id },
        correlationId,
      );

      return {
        success: true,
        message: 'Ad delete request submitted successfully',
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error sending async delete: ${error.message}`);

      return {
        success: false,
        message: 'Failed to submit ad delete request',
        error: error.message,
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('test-kafka')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async testKafka() {
    const correlationId = uuidv4();

    try {
      if (!this.kafkaService) {
        return { success: false, message: 'Kafka is disabled on server' };
      }

      await this.kafkaService.emit(
        'test-topic',
        { message: 'Hello from GOLO Backend!' },
        correlationId,
      );

      return { success: true, message: 'Kafka message emitted', correlationId };
    } catch (error) {
      return { success: false, error: error.message, correlationId };
    }
  }

  /**
   * Promote an ad (Authenticated users only)
   */
  @Post(':adId/promote')
  @UseGuards(JwtAuthGuard)
  async promoteAd(
    @Param('adId') adId: string,
    @Body('package') promotionPackage: string,
    @Body('duration') duration: number,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `REST: Promoting ad: ${adId} with package: ${promotionPackage}`,
    );

    try {
      const promotedUntil = new Date();
      promotedUntil.setDate(promotedUntil.getDate() + duration);

      const updateData: UpdateAdDto = {
        isPromoted: true,
        promotedUntil,
        promotionPackage,
      };

      const updatedAd = await this.adsService.updateAd(
        adId,
        user.id,
        updateData,
      );

      if (this.kafkaService) {
        await this.kafkaService.emit(
          KAFKA_TOPICS.AD_PROMOTED,
          {
            adId,
            userId: user.id,
            promotionPackage,
            promotedUntil,
            timestamp: new Date().toISOString(),
          },
          uuidv4(),
        );
      } else {
        this.logger.warn('Kafka disabled - AD_PROMOTED event not emitted');
      }

      return {
        success: true,
        message: 'Ad promoted successfully',
        data: updatedAd,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error promoting ad: ${error.message}`);

      return {
        success: false,
        message: 'Failed to promote ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Merchant: Submit banner promotion request for admin review
   */
  // ==================== ADMIN ROUTES (Admin only) ====================

  /**
   * Admin: Delete any ad
   */
  @Delete('admin/:adId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminDeleteAd(@Param('adId') adId: string, @CurrentUser() admin: any) {
    this.logger.log(`REST: Admin deleting ad: ${adId}`);

    try {
      await this.adsService.adminDeleteAd(adId, admin.id, admin.email);

      return {
        success: true,
        message: 'Ad deleted successfully by admin',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error in admin delete: ${error.message}`);

      return {
        success: false,
        message: 'Failed to delete ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Admin: Update any ad
   */
  @Put('admin/:adId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminUpdateAd(
    @Param('adId') adId: string,
    @Body() updateData: UpdateAdDto,
    @CurrentUser() admin: any,
  ) {
    this.logger.log(`REST: Admin updating ad: ${adId}`);

    try {
      const updatedAd = await this.adsService.adminUpdateAd(
        adId,
        updateData,
        admin.id,
        admin.email,
      );

      return {
        success: true,
        message: 'Ad updated successfully by admin',
        data: updatedAd,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error in admin update: ${error.message}`);

      return {
        success: false,
        message: 'Failed to update ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Admin: Resync all ads' views to viewHistory.length (one-time migration)
   */
  @Post('admin/resync-views')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async resyncViewCounts() {
    this.logger.log('REST: Admin resyncing view counts to unique visitors');
    try {
      const result = await this.adsService.resyncViewCounts();
      return {
        success: true,
        message: `Resynced ${result.updated} ads`,
        data: result,
      };
    } catch (error) {
      this.logger.error(`REST: Error resyncing views: ${error.message}`);
      return { success: false, message: 'Failed to resync view counts' };
    }
  }

  /**
   * Admin: Manually trigger expired ad cleanup
   * - Deactivates active ads past expiryDate
   * - Deletes expired ads past the 1-day grace period
   */
  @Post('admin/cleanup-expired')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async cleanupExpiredAds() {
    this.logger.log('REST: Admin triggering expired ads cleanup');
    try {
      const deactivated = await this.adsService.deactivateExpiredAds();
      const deleted = await this.adsService.deleteGracePeriodAds();

      // Invalidate cache if anything changed
      if (deactivated > 0 || deleted > 0) {
        await this.adsService.invalidateAdsCache();
      }

      return {
        success: true,
        message: `Cleanup complete: ${deactivated} ads deactivated, ${deleted} ads permanently deleted`,
        data: { deactivated, deleted },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error in expired cleanup: ${error.message}`);
      return {
        success: false,
        message: 'Failed to cleanup expired ads',
        error: error.message,
      };
    }
  }

  /**
   * Admin: Get all ads (including inactive/deleted)
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminGetAllAds() {
    this.logger.log('REST: Admin getting all ads');

    try {
      const ads = await this.adsService.adminGetAllAds();

      return {
        success: true,
        data: ads,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error in admin get all: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get all ads',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('debug/user/:id')
  @UseGuards(JwtAuthGuard)
  async debugCheckUserInAds(@Param('id') id: string) {
    try {
      const exists = await this.adsService.verifyUser(id);
      return {
        success: true,
        data: { exists, userId: id },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('debug/user-check/:userId')
  @UseGuards(JwtAuthGuard)
  async debugUserCheck(@Param('userId') userId: string) {
    try {
      const exists = await this.adsService.verifyUser(userId);
      const userModel = (this.adsService as any).userModel;
      const count = await userModel.countDocuments();
      const sample = await userModel.findOne().exec();

      return {
        success: true,
        data: {
          userId,
          exists,
          totalUsersInAdsService: count,
          sampleUser: sample ? { id: sample._id, email: sample.email } : null,
          message: exists
            ? 'User found in AdsService'
            : 'User NOT found in AdsService',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('debug-create')
  @UseGuards(JwtAuthGuard)
  async debugCreateAd(
    @Body() createAdDto: CreateAdDto,
    @CurrentUser() user: any,
  ) {
    console.log('🔧 DEBUG CREATE AD CALLED');
    console.log('User from token:', user);
    console.log('DTO before:', JSON.stringify(createAdDto));

    // Set userId from token
    createAdDto.userId = user.id;
    createAdDto.userType = user.role === 'admin' ? 'Admin' : 'Customer';

    console.log('DTO after:', JSON.stringify(createAdDto));

    try {
      const ad = await this.adsService.createAd(createAdDto);
      return {
        success: true,
        message: 'Ad created successfully',
        data: ad,
      };
    } catch (error) {
      console.error('❌ Debug create error:', error);
      return {
        success: false,
        message: 'Failed to create ad',
        error: error.message,
      };
    }
  }

  @Get('home/featured')
  async getFeaturedDeals(@Query('limit') limit?: string) {
    this.logger.log('Fetching featured deals for home screen');
    try {
      const limitNum = parseInt(limit || '10', 10);
      const deals = await this.adsService.getFeaturedDeals(limitNum);
      return { success: true, data: deals };
    } catch (error) {
      this.logger.error(`Error fetching featured deals: ${error.message}`);
      return { success: false, message: 'Failed to fetch featured deals' };
    }
  }

  @Get('home/trending')
  async getTrendingSearches(@Query('limit') limit?: string) {
    this.logger.log('Fetching trending searches');
    try {
      const limitNum = parseInt(limit || '10', 10);
      const trending = await this.adsService.getTrendingSearches(limitNum);
      return { success: true, data: trending };
    } catch (error) {
      this.logger.error(`Error fetching trending searches: ${error.message}`);
      return { success: false, message: 'Failed to fetch trending searches' };
    }
  }

  @Get('home/recommended')
  async getRecommendedDeals(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    this.logger.log('Fetching recommended deals');
    try {
      const limitNum = parseInt(limit || '10', 10);
      const userId = user?.id;
      const deals = await this.adsService.getRecommendedDeals(userId, limitNum);
      return { success: true, data: deals };
    } catch (error) {
      this.logger.error(`Error fetching recommended deals: ${error.message}`);
      return { success: false, message: 'Failed to fetch recommended deals' };
    }
  }

  @Get('home/popular-places')
  async getPopularPlaces(@Query('limit') limit?: string) {
    this.logger.log('Fetching popular places');
    try {
      const limitNum = parseInt(limit || '10', 10);
      const places = await this.adsService.getPopularPlaces(limitNum);
      return { success: true, data: places };
    } catch (error) {
      this.logger.error(`Error fetching popular places: ${error.message}`);
      return { success: false, message: 'Failed to fetch popular places' };
    }
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('ad-details/:adId')
  async getAdDetails(@Param('adId') adId: string, @CurrentUser() user?: any) {
    this.logger.log(`Fetching ad details for: ${adId}`);
    try {
      const ad = await this.adsService.getAdById(adId);

      // Track view ONLY if user is authenticated
      if (user?.id) {
        this.adsService
          .trackViewWithVisitor(adId, user.id)
          .catch((e) => this.logger.error(`Error tracking view: ${e.message}`));
      }

      return { success: true, data: ad };
    } catch (error) {
      this.logger.error(`Error fetching ad details: ${error.message}`);
      return { success: false, message: 'Ad not found' };
    }
  }

  /**
   * Track a contact button click (Chat or Call)
   */
  @Post(':adId/click')
  async trackClick(@Param('adId') adId: string) {
    this.logger.log(`REST: Tracking contact click for ad: ${adId}`);
    try {
      await this.adsService.trackContactClick(adId);
      return { success: true };
    } catch (error) {
      this.logger.error(`REST: Error tracking click: ${error.message}`);
      return { success: false, message: 'Failed to track click' };
    }
  }

  /**
   * Track an ad card click / view
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':adId/view')
  async trackView(@Param('adId') adId: string, @CurrentUser() user?: any) {
    this.logger.log(`REST: Tracking view/card click for ad: ${adId}`);
    try {
      if (user?.id) {
        this.adsService
          .trackViewWithVisitor(adId, user.id)
          .catch((e) => this.logger.error(`Error tracking view visitor: ${e.message}`));
      }
      await this.adsService.incrementViewCount(adId);
      return { success: true };
    } catch (error) {
      this.logger.error(`REST: Error tracking view: ${error.message}`);
      return { success: false, message: 'Failed to track view' };
    }
  }

  /**
   * Get wishlist save count for a single ad (public)
   */
  @Get('wishlist-count/:adId')
  async getAdWishlistCount(@Param('adId') adId: string) {
    this.logger.log(`REST: Getting wishlist count for ad: ${adId}`);
    try {
      const count = await this.adsService.getAdWishlistCount(adId);
      return { success: true, data: { adId, wishlistCount: count } };
    } catch (error) {
      this.logger.error(`REST: Error getting wishlist count: ${error.message}`);
      return { success: false, message: 'Failed to get wishlist count' };
    }
  }

  // ==================== REPORTING & MODERATION ROUTES (MUST BE BEFORE :adId) ====================

  /**
   * Get all reports queue (admin only) - shows ALL reports regardless of status
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('reports')
  async getAllReports() {
    this.logger.log('Admin fetching all reports queue');

    try {
      const reports = await this.adsService.getAllReports();

      this.logger.log(`✅ Successfully fetched ${reports.length} reports`);

      return {
        success: true,
        data: reports,
        count: reports.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `❌ Error fetching reports: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: 'Failed to fetch reports',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get reports for a specific ad (admin only)
   */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('reports/:adId')
  async getAdReports(@Param('adId') adId: string) {
    this.logger.log(`Admin fetching enriched reports for ad: ${adId}`);
    try {
      const reports = await this.adsService.getAdReports(adId);
      return {
        success: true,
        data: reports,
        count: reports.length,
      };
    } catch (error: any) {
      this.logger.error(`Error fetching enriched reports: ${error.message}`);
      return {
        success: false,
        message: 'Failed to fetch reports',
        error: error.message,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('reports/merchant/my')
  async getMerchantReports(
    @CurrentUser() user: any,
    @Query('status') status?: 'pending' | 'reviewed' | 'action_taken',
  ) {
    const rows = await this.adsService.getMerchantReports(
      user.id,
      status as any,
    );
    return {
      success: true,
      data: rows,
      count: rows.length,
    };
  }

  /**
   * Get a single report by reportId (admin only, enriched)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('reports/report/:reportId')
  async getReportByReportId(@Param('reportId') reportId: string) {
    this.logger.log(`Admin fetching enriched report for reportId: ${reportId}`);
    try {
      const report = await this.adsService.getReportByReportId(reportId);
      return {
        success: true,
        data: report ? [report] : [],
      };
    } catch (error: any) {
      this.logger.error(`Error fetching enriched report: ${error.message}`);
      return {
        success: false,
        message: 'Failed to fetch report',
        error: error.message,
      };
    }
  }

  /**
   * Keep this dynamic GET route near the bottom so static routes always win.
   */
  @Get(':adId')
  async getAdById(@Param('adId') adId: string) {
    this.logger.log(`REST: Getting ad by ID: ${adId}`);

    try {
      const ad = await this.adsService.getAdById(adId);

      return {
        success: true,
        data: ad,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`REST: Error getting ad: ${error.message}`);

      return {
        success: false,
        message: 'Failed to get ad',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ==================== REPORTING & MODERATION ROUTES ====================

  /**
   * Submit a report for an ad (requires authentication)
   */
  @UseGuards(JwtAuthGuard)
  @Post(':adId/report')
  @HttpCode(HttpStatus.OK)
  async submitReport(
    @Param('adId') adId: string,
    @Body() createReportDto: CreateReportDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`User ${user?.id} reporting ad ${adId}`);

    try {
      const result = await this.adsService.submitReport(
        adId,
        user.id,
        createReportDto.reason,
        createReportDto.description,
      );

      return {
        success: true,
        message: result.message,
        data: { reportId: result.reportId },
      };
    } catch (error: any) {
      this.logger.error(`Error submitting report: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Failed to submit report',
        statusCode: error.getStatus ? error.getStatus() : 400,
      };
    }
  }

  /**
   * Update report status (admin only)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('reports/:reportId/status')
  async updateReportStatus(
    @Param('reportId') reportId: string,
    @Body() updateDto: UpdateReportStatusDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`Admin updating report ${reportId} status`);

    try {
      const result = await this.adsService.updateReportStatus(
        reportId,
        updateDto.status,
        updateDto.adminNotes,
        user.id,
        user.email,
      );

      return {
        success: true,
        message: result.message,
      };
    } catch (error: any) {
      this.logger.error(`Error updating report status: ${error.message}`);
      return {
        success: false,
        message: 'Failed to update report status',
        error: error.message,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('reports/:reportId/merchant-status')
  async updateMerchantReportStatus(
    @Param('reportId') reportId: string,
    @Body() updateDto: UpdateReportStatusDto,
    @CurrentUser() user: any,
  ) {
    const result = await this.adsService.updateMerchantReportStatus(
      reportId,
      updateDto.status,
      user.id,
      updateDto.adminNotes,
    );

    return {
      success: true,
      message: result.message,
    };
  }

  /**
   * Admin review decision on flagged ad (admin only)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/:adId/review')
  async reviewAd(
    @Param('adId') adId: string,
    @Body()
    body: {
      decision: 'approve' | 'remove' | 'request_changes';
      adminNotes?: string;
    },
    @CurrentUser() user: any,
  ) {
    this.logger.log(`Admin reviewing ad ${adId}, decision: ${body.decision}`);

    try {
      const result = await this.adsService.reviewAd(
        adId,
        body.decision,
        body.adminNotes,
        user.id,
        user.email,
      );

      return {
        success: true,
        message: result.message,
      };
    } catch (error: any) {
      this.logger.error(`Error reviewing ad: ${error.message}`);
      return {
        success: false,
        message: 'Failed to review ad',
        error: error.message,
      };
    }
  }

  /**
   * Recalculate report counts for all ads (admin utility)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/resync-reports')
  async resyncReportCounts() {
    this.logger.log('Admin resyncing report counts');

    try {
      const result = await this.adsService.resyncReportCounts();
      return {
        success: true,
        message: `Resynced ${result.updated} ads`,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`Error resyncing report counts: ${error.message}`);
      return {
        success: false,
        message: 'Failed to resync report counts',
        error: error.message,
      };
    }
  }
}

import {
  Controller,
  Put,
  Get,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateStoreLocationDto } from '../users/dto/update-store-location.dto';
import { UpdateMerchantProfileDto } from './dto/update-merchant-profile.dto';

@Controller('merchant')
@UseGuards(JwtAuthGuard)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  /**
   * Update merchant store location with coordinates
   * PUT /merchant/store-location
   */
  @Put('store-location')
  async updateStoreLocation(
    @CurrentUser() user: any,
    @Body() locationData: UpdateStoreLocationDto,
  ) {
    if (!user?.id && !user?._id) {
      throw new BadRequestException('User authentication required');
    }

    const userId = user.id || user._id;

    return await this.merchantsService.updateStoreLocation(userId, locationData);
  }

  /**
   * Get merchant store location
   * GET /merchant/store-location
   */
  @Get('store-location')
  async getStoreLocation(@CurrentUser() user: any) {
    if (!user?.id && !user?._id) {
      throw new BadRequestException('User authentication required');
    }

    const userId = user.id || user._id;

    return await this.merchantsService.getStoreLocation(userId);
  }

  /**
   * Get nearby merchants (for future use in deals/products)
   * GET /merchant/nearby?lat=16.8149&lng=73.8292&radius=10
   */
  @Get('nearby')
  async getNearbyMerchants(
    @CurrentUser() user: any,
    latitude?: number,
    longitude?: number,
    radius?: number,
  ) {
    if (!latitude || !longitude) {
      throw new BadRequestException('Latitude and longitude are required');
    }

    return await this.merchantsService.getNearbyMerchants(
      latitude,
      longitude,
      radius || 10,
    );
  }

  /**
   * Update merchant profile information
   * PUT /merchant/profile
   */
  @Put('profile')
  async updateMerchantProfile(
    @CurrentUser() user: any,
    @Body() updateData: UpdateMerchantProfileDto,
  ) {
    if (!user?.id && !user?._id) {
      throw new BadRequestException('User authentication required');
    }

    const userId = user.id || user._id;
    return await this.merchantsService.updateMerchantProfile(userId, updateData);
  }
}

import { Controller, Get, Param } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

@Controller('merchant')
export class PublicMerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('public/:merchantId/profile')
  async getPublicMerchantProfile(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getPublicMerchantProfile(merchantId);
  }

  @Get('public/:merchantId/store-location')
  async getPublicMerchantStoreLocation(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getPublicMerchantStoreLocation(merchantId);
  }
}

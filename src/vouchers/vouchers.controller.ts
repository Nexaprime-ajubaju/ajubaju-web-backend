import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ClaimOfferDto,
  ShareVoucherDto,
  VerifyVoucherDto,
  RedeemVoucherDto,
  GetMyVouchersDto,
  GetMerchantVouchersDto,
} from './dto/claim-offer.dto';

@Controller('vouchers')
export class VouchersController {
  private readonly logger = new Logger('VouchersController');

  constructor(private readonly vouchersService: VouchersService) {}

  /**
   * POST /vouchers/claim
   * User claims an offer and receives a voucher/QR code
   */
  @Post('claim')
  @UseGuards(JwtAuthGuard)
  async claimOffer(
    @Body() claimOfferDto: ClaimOfferDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?._id;
    if (!userId) {
      throw new BadRequestException('User ID not found');
    }

    return await this.vouchersService.claimOffer(userId, claimOfferDto.offerId, {
      latitude: claimOfferDto.latitude,
      longitude: claimOfferDto.longitude,
      location: claimOfferDto.location,
    });
  }

  /**
   * GET /vouchers/my-vouchers
   * Get user's all claimed vouchers with filtering
   */
  @Get('my-vouchers')
  @UseGuards(JwtAuthGuard)
  async getMyVouchers(
    @Query() query: GetMyVouchersDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?._id;
    if (!userId) {
      throw new BadRequestException('User ID not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;

    return await this.vouchersService.getMyVouchers(
      userId,
      page,
      limit,
      query.status,
    );
  }

  @Get('public/:voucherId/status')
  async getPublicVoucherStatus(@Param('voucherId') voucherId: string) {
    return await this.vouchersService.getPublicVoucherStatus(voucherId);
  }

  /**
   * GET /vouchers/:voucherId
   * Get single voucher details by ID
   */
  @Get(':voucherId')
  @UseGuards(JwtAuthGuard)
  async getVoucherById(
    @Param('voucherId') voucherId: string,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?._id;
    return await this.vouchersService.getVoucherById(voucherId, userId);
  }

  /**
   * GET /vouchers/:voucherId/download-qr
   * Download voucher QR code as image
   */
  @Get(':voucherId/download-qr')
  @UseGuards(JwtAuthGuard)
  async downloadVoucherQR(
    @Param('voucherId') voucherId: string,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?._id;
    return await this.vouchersService.downloadVoucherQR(voucherId, userId);
  }

  /**
   * POST /vouchers/:voucherId/share
   * Share voucher with friend via email
   */
  @Post(':voucherId/share')
  @UseGuards(JwtAuthGuard)
  async shareVoucher(
    @Param('voucherId') voucherId: string,
    @Body() shareVoucherDto: ShareVoucherDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?._id;
    if (!userId) {
      throw new BadRequestException('User ID not found');
    }

    return await this.vouchersService.shareVoucher(
      voucherId,
      shareVoucherDto.friendEmail,
      userId,
    );
  }

  /**
   * POST /vouchers/verify-code
   * Merchant verifies voucher using verification code (manual entry)
   */
  @Post('verify-code')
  @UseGuards(JwtAuthGuard)
  async verifyVoucherByCode(
    @Body() body: { code: string },
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    return await this.vouchersService.verifyVoucherByCode(body.code, merchantId);
  }

  /**
   * POST /vouchers/:voucherId/verify
   * Merchant verifies QR code WITHOUT redeeming
   */
  @Post(':voucherId/verify')
  @UseGuards(JwtAuthGuard)
  async verifyVoucher(
    @Param('voucherId') voucherId: string,
    @Body() verifyVoucherDto: VerifyVoucherDto,
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    return await this.vouchersService.verifyVoucher(
      voucherId,
      verifyVoucherDto.qrCode,
      merchantId,
    );
  }

  /**
   * POST /vouchers/:voucherId/redeem
   * Merchant completes the redemption
   */
  @Post(':voucherId/redeem')
  @UseGuards(JwtAuthGuard)
  async redeemVoucher(
    @Param('voucherId') voucherId: string,
    @Body() redeemVoucherDto: RedeemVoucherDto,
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    if (!merchantId) {
      throw new BadRequestException('Merchant ID not found');
    }

    return await this.vouchersService.redeemVoucher(
      voucherId,
      redeemVoucherDto.qrCode,
      merchantId,
      redeemVoucherDto.verificationCode,
    );
  }

  /**
   * POST /vouchers/:voucherId/generate-code
   * Generate verification code on-demand when user reaches redeem page
   * This speeds up the claim process by deferring code generation
   */
  @Post(':voucherId/generate-code')
  @UseGuards(JwtAuthGuard)
  async generateVerificationCode(
    @Param('voucherId') voucherId: string,
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    if (!merchantId) {
      throw new BadRequestException('Merchant ID not found');
    }

    return await this.vouchersService.generateVerificationCodeForVoucher(
      voucherId,
      merchantId,
    );
  }

  /**
   * GET /vouchers/merchant/pending
   * Get merchant's pending redemptions (to be redeemed)
   */
  @Get('merchant/pending')
  @UseGuards(JwtAuthGuard)
  async getMerchantPendingRedemptions(
    @Query() query: GetMerchantVouchersDto,
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    if (!merchantId) {
      throw new BadRequestException('Merchant ID not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;

    return await this.vouchersService.getMerchantPendingRedemptions(
      merchantId,
      page,
      limit,
      query.status,
    );
  }

  /**
   * GET /vouchers/merchant/history
   * Get merchant's redemption history (already redeemed)
   */
  @Get('merchant/history')
  @UseGuards(JwtAuthGuard)
  async getMerchantRedemptionHistory(
    @Query() query: GetMerchantVouchersDto,
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    if (!merchantId) {
      throw new BadRequestException('Merchant ID not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;

    return await this.vouchersService.getMerchantRedemptionHistory(
      merchantId,
      page,
      limit,
    );
  }

  /**
   * GET /vouchers/merchant/offers
   * Get all active offers for the merchant
   */
  @Get('merchant/offers')
  @UseGuards(JwtAuthGuard)
  async getMerchantOffers(
    @Query() query: GetMerchantVouchersDto,
    @CurrentUser() user: any,
  ) {
    const merchantId = user?.id || user?._id;
    if (!merchantId) {
      throw new BadRequestException('Merchant ID not found');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;

    return await this.vouchersService.getMerchantOffers(
      merchantId,
      page,
      limit,
      query.status,
    );
  }
}

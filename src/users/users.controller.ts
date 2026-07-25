import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Delete,
  Param,
  UseGuards,
  Query,
  Ip,
  NotFoundException,
  Req,
  BadRequestException,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialAuthDto } from './dto/social-auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from './schemas/user.schema';
import { RedisService } from '../common/services/redis.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) { }

  // ==================== FOLLOW MERCHANT ====================
  @Post('merchants/:merchantId/follow')
  @UseGuards(JwtAuthGuard)
  async toggleFollowMerchant(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any
  ) {
    const userId = user?.id || user?._id;
    return this.usersService.toggleFollowMerchant(userId, merchantId);
  }

  @Get('merchants/:merchantId/follow-status')
  @UseGuards(JwtAuthGuard)
  async checkFollowStatus(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any
  ) {
    const userId = user?.id || user?._id;
    return this.usersService.checkFollowStatus(userId, merchantId);
  }

  // ==================== USER REPORT ====================
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  async reportUser(
    @Param('id') id: string,
    @CurrentUser() reporter: any,
    @Body()
    body: { reason: string; description?: string; evidenceUrls?: string[] },
  ) {
    const { reason, description, evidenceUrls } = body;
    const reporterId = reporter?.id || reporter?._id;
    if (!reporterId) {
      throw new Error('Authenticated user id not found');
    }
    const result = await this.usersService.submitUserReport(
      id,
      reporterId,
      reason,
      description,
      evidenceUrls,
    );
    return { success: true, ...result };
  }

  // ==================== ADMIN USER REPORTS ====================
  @Get('admin/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAllUserReports(
    @Query('limit') limit = '50',
    @Query('skip') skip = '0',
  ) {
    const limitNum = Number(limit) || 50;
    const skipNum = Number(skip) || 0;
    return this.usersService.getAllUserReports(limitNum, skipNum);
  }

  @Get('admin/reports/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getUserReportStats() {
    const stats = await this.usersService.getUserReportStats();
    return { success: true, data: stats };
  }

  @Get('admin/reports/:reportId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getUserReportById(@Param('reportId') reportId: string) {
    return this.usersService.getUserReportById(reportId);
  }

  // ==================== ADMIN SUSPEND/UNSUSPEND ====================
  @Post('admin/users/:id/ban')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async banUser(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Body('duration') duration: number,
    @CurrentUser() admin: any,
  ) {
    const user = await this.usersService.banUser(
      id,
      reason,
      admin.id,
      admin.email,
      duration,
    );
    return { success: true, data: user };
  }

  @Post('admin/users/:id/unban')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async unbanUser(@Param('id') id: string, @CurrentUser() admin: any) {
    const user = await this.usersService.unbanUser(id, admin.id, admin.email);
    return { success: true, data: user };
  }

  @Post('validate-registration-step')
  async validateRegistrationStep(@Body() dto: any) {
    return this.usersService.validateRegistrationStep(dto);
  }

  @Post('email-otp/send')
  async sendEmailOTP(
    @Body() body: { email: string; type: 'register' | 'profile'; accountType?: 'user' | 'merchant' }
  ) {
    const result = await this.usersService.sendEmailOTP(body.email, body.type, body.accountType);
    return { success: true, ...result };
  }

  @Post('email-otp/verify')
  async verifyEmailOTP(
    @Body() body: { email: string; otp: string }
  ) {
    const result = await this.usersService.verifyEmailOTP(body.email, body.otp);
    return { success: true, ...result };
  }

  @Post('profile/email-otp/send')
  @UseGuards(JwtAuthGuard)
  async sendProfileEmailOTP(
    @CurrentUser() user: any,
    @Body() body: { email: string }
  ) {
    const result = await this.usersService.sendEmailOTP(body.email, 'profile', undefined, user.id);
    return { success: true, ...result };
  }

  @Post('profile/email-otp/verify')
  @UseGuards(JwtAuthGuard)
  async verifyProfileEmailOTP(
    @Body() body: { email: string; otp: string }
  ) {
    const result = await this.usersService.verifyEmailOTP(body.email, body.otp);
    return { success: true, ...result };
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Ip() ip: string, @Req() req: any) {
    const user = await this.usersService.register(
      dto,
      ip,
      req?.headers?.['user-agent'],
    );
    return {
      success: true,
      message: 'User registered successfully',
      data: user,
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: any) {
    const result = await this.usersService.login(
      dto,
      ip,
      req?.headers?.['user-agent'],
    );
    return { success: true, message: 'Login successful', data: result };
  }

  @Post('social-auth')
  async socialAuth(
    @Body() dto: SocialAuthDto,
    @Ip() ip: string,
    @Req() req: any,
  ) {
    const result = await this.usersService.socialAuth(
      dto,
      ip,
      req?.headers?.['user-agent'],
    );
    return { success: true, message: 'Social login successful', data: result };
  }

  @Post('refresh')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    const result = await this.usersService.refreshToken(dto.refreshToken);
    return { success: true, data: result };
  }

  @Post('forgot-password/send-otp')
  async sendForgotPasswordOTP(@Body() body: { email: string }) {
    const result = await this.usersService.sendForgotPasswordOTP(body.email);
    return { success: true, message: 'OTP sent', data: result };
  }

  @Post('forgot-password/verify-otp')
  async verifyForgotPasswordOTP(@Body() body: { email: string; otp: string }) {
    const result = await this.usersService.verifyForgotPasswordOTP(
      body.email,
      body.otp,
    );
    return { success: true, message: 'OTP verified', data: result };
  }

  @Post('forgot-password/reset')
  async resetForgotPassword(
    @Body() body: { email: string; otp: string; newPassword: string },
  ) {
    const result = await this.usersService.resetForgotPassword(
      body.email,
      body.otp,
      body.newPassword,
    );
    return {
      success: true,
      message: 'Password changed successfully',
      data: result,
    };
  }

  @Get('dashboard/stats')
  async getDashboardStats() {
    const cacheKey = 'golo:users:dashboard:stats';
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return { success: true, data: cached, fromCache: true };
    }

    const stats = await this.usersService.getDashboardStatsPublic();
    await this.redisService.set(cacheKey, stats, 90);
    return { success: true, data: stats };
  }

  // ==================== USER ROUTES ====================
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: any, @Body() dto: RefreshTokenDto) {
    await this.usersService.logout(user.id, dto.refreshToken);
    return { success: true, message: 'Logout successful' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    const profile = await this.usersService.getProfile(user.id);
    return { success: true, data: profile };
  }

  @Get('merchant/profile')
  @UseGuards(JwtAuthGuard)
  async getMerchantProfile(@CurrentUser() user: any) {
    const data = await this.usersService.getMerchantProfile(user.id);
    return { success: true, data };
  }

  // Save pending merchant location (used when frontend couldn't submit coords during register)
  @Post('pending-location')
  async savePendingMerchantLocation(
    @Body()
    body: {
      email: string;
      address: string;
      latitude: number;
      longitude: number;
    },
  ) {
    const res = await this.usersService.savePendingMerchantLocation(body);
    return { success: true, data: res };
  }

  // Sync pending merchant location into merchant profile after login
  @Post('pending-location/sync')
  @UseGuards(JwtAuthGuard)
  async syncPendingMerchantLocation(@CurrentUser() user: any) {
    const res = await this.usersService.syncPendingMerchantLocation(
      user.id,
      user.email,
    );
    return { success: true, data: res };
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@CurrentUser() user: any, @Body() data: any) {
    try {
      console.log(
        `[Controller] Updating profile for user ${user.id} with data:`,
        {
          hasName: !!data.name,
          hasEmail: !!data.email,
          hasProfilePhoto: !!data.profilePhoto,
          photoSize: data.profilePhoto
            ? (
              Buffer.byteLength(data.profilePhoto, 'utf8') /
              1024 /
              1024
            ).toFixed(2) + 'MB'
            : 'N/A',
          hasInterests: !!data.profile?.interests,
        },
      );

      const profile = await this.usersService.updateProfile(user.id, data);

      console.log(`[Controller] Profile updated successfully:`, {
        hasPhoto: !!profile.profilePhoto,
        interests: profile.profile?.interests?.length || 0,
      });

      return {
        success: true,
        message: 'Profile updated successfully',
        data: profile,
      };
    } catch (error) {
      console.error(`[Controller] Error updating profile:`, error.message);
      throw error;
    }
  }

  // ==================== PASSWORD OTP ====================
  @Post('send-password-otp')
  @UseGuards(JwtAuthGuard)
  async sendOTP(@CurrentUser() user: any) {
    const result = await this.usersService.sendPasswordChangeOTP(user.id);
    return { success: true, message: 'OTP sent', data: result };
  }

  @Post('verify-password-otp')
  @UseGuards(JwtAuthGuard)
  async verifyOTP(@CurrentUser() user: any, @Body() body: any) {
    const result = await this.usersService.verifyPasswordChangeOTP(
      user.id,
      body.otp,
    );
    return { success: true, message: 'OTP verified', data: result };
  }

  @Post('change-password-otp')
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: any, @Body() body: any) {
    const result = await this.usersService.changePasswordWithOTP(
      user.id,
      body.otp,
      body.newPassword,
    );
    return { success: true, message: 'Password changed', data: result };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePasswordDirect(
    @CurrentUser() user: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const result = await this.usersService.changePasswordDirect(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    return {
      success: true,
      message: 'Password changed successfully',
      data: result,
    };
  }


  // ==================== WISHLIST ====================

  @Get('wishlist')
  @UseGuards(JwtAuthGuard)
  async getWishlist(@CurrentUser() user: any) {
    return {
      success: true,
      data: await this.usersService.getWishlistAds(user.id),
    };
  }

  @Get('wishlist/ids')
  @UseGuards(JwtAuthGuard)
  async getWishlistIds(@CurrentUser() user: any) {
    return {
      success: true,
      data: await this.usersService.getWishlistIds(user.id),
    };
  }

  @Post('wishlist/:adId')
  @UseGuards(JwtAuthGuard)
  async toggleWishlist(@CurrentUser() user: any, @Param('adId') adId: string) {
    return {
      success: true,
      data: await this.usersService.toggleWishlist(user.id, adId),
    };
  }

  @Post('likes/product')
  @UseGuards(JwtAuthGuard)
  async likeProduct(
    @CurrentUser() user: any,
    @Body() body: { offerId: string; product?: any },
  ) {
    return {
      success: true,
      data: await this.usersService.likeProduct(
        user.id,
        body?.offerId,
        body?.product || null,
      ),
    };
  }

  @Get('merchant/liked-products')
  @UseGuards(JwtAuthGuard)
  async getMerchantLikedProducts(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    return {
      success: true,
      data: await this.usersService.getMerchantLikedProducts(
        user.id,
        limit ? Number(limit) : 10,
      ),
    };
  }

  // ==================== NOTIFICATIONS ====================
  @Post('admin/notifications/broadcast')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminBroadcastNotification(
    @CurrentUser() admin: any,
    @Body() body: { audience: string; type: string; title: string; message: string }
  ) {
    if (!body.audience || !body.type || !body.message) {
      throw new BadRequestException('Missing required fields for broadcast');
    }
    const adminId = admin.id || admin._id;
    return this.usersService.adminBroadcastNotification(
      adminId,
      admin.email,
      body.audience,
      body.type,
      body.title,
      body.message
    );
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  async getNotifications(@CurrentUser() user: any) {
    return {
      success: true,
      data: await this.usersService.getNotifications(user.id),
    };
  }

  @Post('notifications/push-token')
  @UseGuards(JwtAuthGuard)
  async registerPushToken(
    @CurrentUser() user: any,
    @Body() body: { pushToken?: string },
  ) {
    return this.usersService.registerPushToken(user?.id || user?._id, body?.pushToken);
  }

  @Post('notifications/:notificationId/read')
  @UseGuards(JwtAuthGuard)
  async markNotificationRead(
    @CurrentUser() user: any,
    @Param('notificationId') notificationId: string,
  ) {
    await this.usersService.markNotificationRead(notificationId, user.id);
    return { success: true };
  }

  @Post('notifications/read-all')
  @UseGuards(JwtAuthGuard)
  async markAllNotificationsRead(@CurrentUser() user: any) {
    await this.usersService.markAllNotificationsRead(user.id);
    return { success: true };
  }

  @Delete('notifications')
  @UseGuards(JwtAuthGuard)
  async deleteAllNotifications(@CurrentUser() user: any) {
    await this.usersService.deleteAllNotifications(user.id);
    return { success: true };
  }

  // ==================== ADMIN ====================
  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminGetAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    return { success: true, data: await this.usersService.adminGetAllUsers(pageNum, limitNum) };
  }

  @Delete('admin/users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string, @CurrentUser() admin: any) {
    try {
      await this.usersService.adminDeleteUser(id, admin.id, admin.email);
      return { success: true };
    } catch (error) {
      console.error(`[UsersController] Error deleting user ${id}:`, error);
      throw new BadRequestException(`Failed to delete user: ${error.message}`);
    }
  }

  @Post('admin/users/:id/kyc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUserKyc(
    @Param('id') id: string,
    @Body('kycStatus') kycStatus: string,
    @Body('rejectionReason') rejectionReason: string,
    @CurrentUser() admin: any
  ) {
    const adminId = admin?.id || 'test-admin';
    const adminEmail = admin?.email || 'test@admin.com';
    const data = await this.usersService.updateUserKycStatus(id, kycStatus, rejectionReason, adminId, adminEmail);
    return { success: true, data };
  }

  // ==================== DYNAMIC ====================
  @Get(':id')
  async getUser(@Param('id') id: string) {
    return { success: true, data: await this.usersService.getUserById(id) };
  }
}

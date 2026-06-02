

import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException, Logger, InternalServerErrorException, Optional, forwardRef, Inject, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { Merchant, MerchantDocument } from './schemas/merchant.schema';
import { UserReport, UserReportDocument } from './schemas/user-report.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SocialAuthDto } from './dto/social-auth.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AdsService } from '../ads/ads.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Payment, PaymentDocument, PaymentStatus } from '../payments/schemas/payment.schema';
import { OfferLikeHistory, OfferLikeHistoryDocument } from '../offers/schemas/offer-like-history.schema';
import { OfferPromotion, OfferPromotionDocument } from '../offers/schemas/offer-promotion.schema';
import { RedisService } from '../common/services/redis.service';
import { validatePreferredCategories, normalizeCategories } from '../common/constants/categories';

@Injectable()
export class UsersService implements OnModuleInit {

  private readonly logger = new Logger(UsersService.name);
  private mailTransporter: nodemailer.Transporter | null = null;
  private mailFrom: string | null = null;

  private ensureOtpMailerReady() {
    if (this.mailTransporter && this.mailFrom) return;

    const smtpHost =
      this.configService.get<string>('SMTP_HOST') ||
      this.configService.get<string>('EMAIL_HOST');
    const smtpPort = Number(
      this.configService.get<string>('SMTP_PORT') ||
        this.configService.get<string>('EMAIL_PORT') ||
        '587',
    );
    const smtpUser =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('EMAIL_USER');
    const smtpPass =
      this.configService.get<string>('SMTP_PASS') ||
      this.configService.get<string>('EMAIL_PASSWORD');
    this.mailFrom =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('EMAIL_FROM') ||
      smtpUser ||
      null;

    this.logger.debug(
      `OTP mailer config host=${!!smtpHost} port=${smtpPort} user=${!!smtpUser} from=${!!this.mailFrom}`,
    );

    if (smtpHost && smtpUser && smtpPass && this.mailFrom) {
      this.mailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
    }
  }

  /**
   * Admin: Send a warning notification to a user
   */
  async adminWarnUser(userId: string, message: string, adminId: string, adminEmail: string): Promise<void> {
    this.logger.log(`Admin sending warning to user: ${userId}`);
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.notificationModel.create({
      recipientId: userId,
      senderId: adminId,
      senderName: adminEmail || 'admin',
      adId: '-',
      adTitle: '-',
      type: 'admin_warning',
      message: message || 'You have received a warning from admin.',
      read: false,
    });
    if (this.auditLogsService) {
      await this.auditLogsService.log({
        action: 'USER_WARNED',
        adminId,
        adminEmail,
        targetId: userId,
        targetType: 'User',
        details: { message },
      });
    }
  }

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(Merchant.name) private merchantModel: Model<MerchantDocument>,
    @InjectModel(UserReport.name) private userReportModel: Model<UserReportDocument>,
    private jwtService: JwtService,
    private readonly auditLogsService: AuditLogsService,
    private configService: ConfigService,
    @Optional() private kafkaService?: KafkaService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() @Inject(forwardRef(() => AdsService)) private adsService?: AdsService,
    @Optional() @InjectModel(Payment.name) private paymentModel?: Model<PaymentDocument>,
    @Optional() @InjectModel('PendingMerchantLocation') private pendingLocationModel?: Model<any>,
    @Optional() @InjectModel(OfferLikeHistory.name) private offerLikeHistoryModel?: Model<OfferLikeHistoryDocument>,
    @Optional() @InjectModel(OfferPromotion.name) private offerPromotionModel?: Model<OfferPromotionDocument>,
  ) {
    // Support both SMTP_* and EMAIL_* env var conventions.
    // The repo's `.env` currently uses EMAIL_* while OTP flow historically used SMTP_*.
    const smtpHost =
      this.configService.get<string>('SMTP_HOST') ||
      this.configService.get<string>('EMAIL_HOST');
    const smtpPort = Number(
      this.configService.get<string>('SMTP_PORT') ||
        this.configService.get<string>('EMAIL_PORT') ||
        '587',
    );
    const smtpUser =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('EMAIL_USER');
    const smtpPass =
      this.configService.get<string>('SMTP_PASS') ||
      this.configService.get<string>('EMAIL_PASSWORD');
    this.mailFrom =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('EMAIL_FROM') ||
      smtpUser ||
      null;

    this.logger.debug(`SMTP config host=${!!smtpHost} port=${smtpPort} user=${!!smtpUser}`);

    if (smtpHost && smtpUser && smtpPass && this.mailFrom) {
      this.mailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else {
      this.logger.warn('SMTP credentials missing; email OTP functionality disabled');
    }
  }

  // Save a pending merchant location for later sync
  async savePendingMerchantLocation(payload: { email: string; address: string; latitude: number; longitude: number }) {
    const normalizedEmail = String(payload.email || '').trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('Email is required');
    const doc = await this.pendingLocationModel.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: { address: payload.address || '', latitude: Number(payload.latitude), longitude: Number(payload.longitude), updatedAt: new Date() } },
      { upsert: true, new: true },
    ).lean().exec();
    return doc;
  }

  // Sync pending merchant location into merchant profile
  async syncPendingMerchantLocation(userId: string, email: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;
    const pending = await this.pendingLocationModel.findOne({ email: normalizedEmail }).lean().exec();
    if (!pending) return null;
    // find merchant by userId
    const merchant = await this.merchantModel.findOne({ userId: userId }).exec();
    if (!merchant) return null;
    const pendingAny: any = pending;
    merchant.storeLocation = pendingAny.address || merchant.storeLocation;
    merchant.storeLocationLatitude = Number(pendingAny.latitude);
    merchant.storeLocationLongitude = Number(pendingAny.longitude);
    await merchant.save();
    await this.pendingLocationModel.deleteOne({ email: normalizedEmail }).exec();
    return merchant;
  }

  async onModuleInit() {
    if (this.kafkaService) {
      this.logger.log('Kafka service connected for UsersService');
    }
  }

  // ==================== PUBLIC METHODS ====================
  async getUserReportStats() {
    // Example stats: total, pending, under investigation, resolved reports
    const total = await this.userReportModel.countDocuments();
    const pending = await this.userReportModel.countDocuments({ status: 'pending' });
    const underInvestigation = await this.userReportModel.countDocuments({ status: 'under_investigation' });
    const resolved = await this.userReportModel.countDocuments({ status: { $in: ['resolved', 'dismissed'] } });
    return { total, pending, underInvestigation, resolved };
  }
  async register(registerDto: RegisterDto): Promise<UserResponseDto> {
    this.logger.log(`Registering new user: ${registerDto.email}`);
    
    // Check if user exists
    const existingUser = await this.userModel.findOne({ email: registerDto.email }).exec();
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Check for admin email in config
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const isSystemAdmin = adminEmail && registerDto.email.toLowerCase() === adminEmail.toLowerCase();

    const accountType = registerDto.accountType === 'merchant' ? 'merchant' : 'user';

    if (accountType === 'merchant') {
      if (!registerDto.storeName?.trim()) {
        throw new BadRequestException('Store name is required for merchant registration');
      }
      if (!registerDto.storeEmail?.trim()) {
        throw new BadRequestException('Store email is required for merchant registration');
      }
      if (!registerDto.storeLocation?.trim()) {
        throw new BadRequestException('Store location is required for merchant registration');
      }

      const latitude = Number(registerDto.storeLocationLatitude);
      const longitude = Number(registerDto.storeLocationLongitude);
      const hasValidCoordinates =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;

      if (!hasValidCoordinates) {
        throw new BadRequestException(
          'Please select store location on map to capture valid coordinates',
        );
      }
    }

    const assignedRole = isSystemAdmin
      ? UserRole.ADMIN
      : (accountType === 'merchant' ? UserRole.MERCHANT : UserRole.USER);

    // Create user (Admin if matches config, else based on account type)
    const user = new this.userModel({
      name: registerDto.name,
      email: registerDto.email,
      password: hashedPassword,
      role: assignedRole,
      accountType,
      profile: {
        phone: registerDto.phone,
      },
      metadata: {
        registeredIp: '0.0.0.0',
      },
      refreshTokens: [],
    });

    const savedUser = await user.save();

    if (accountType === 'merchant') {
      const latitude = Number(registerDto.storeLocationLatitude);
      const longitude = Number(registerDto.storeLocationLongitude);

      await this.merchantModel.create({
        userId: savedUser._id.toString(),
        storeName: registerDto.storeName?.trim(),
        storeEmail: registerDto.storeEmail?.trim() || registerDto.email,
        gstNumber: registerDto.gstNumber?.trim() || undefined,
        contactNumber: registerDto.contactNumber?.trim() || registerDto.phone,
        storeCategory: registerDto.storeCategory?.trim() || undefined,
        storeSubCategory: registerDto.storeSubCategory?.trim() || undefined,
        storeLocation: registerDto.storeLocation?.trim() || undefined,
        storeLocationLatitude: latitude,
        storeLocationLongitude: longitude,
        status: 'active',
      });
    }

    // Emit Kafka event
    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.USER_REGISTERED, {
        userId: savedUser._id,
        email: savedUser.email,
        role: savedUser.role,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn('Kafka disabled - USER_REGISTERED event skipped');
    }

    return this.toResponseDto(savedUser);
  }

  async login(loginDto: LoginDto, ip?: string): Promise<{ accessToken: string; refreshToken: string; user: UserResponseDto }> {
    this.logger.log(`Login attempt: ${loginDto.email} (accountType: ${loginDto.accountType})`);
    
    const user = await this.userModel.findOne({ email: loginDto.email }).exec();
    if (!user) {
      this.logger.warn(`Login failed - user not found: ${loginDto.email}`);
      if (loginDto.accountType === 'merchant') {
        throw new UnauthorizedException('This email is not registered as a merchant. Please register as a merchant first.');
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed - invalid password: ${loginDto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (loginDto.accountType === 'merchant' && user.accountType !== 'merchant') {
      this.logger.warn(`Login failed - merchant login attempted with user account: ${loginDto.email}`);
      throw new UnauthorizedException('This email is not registered as a merchant. Please use the User login or register as a merchant.');
    }

    if (loginDto.accountType === 'user' && user.accountType === 'merchant') {
      this.logger.warn(`Login failed - user login attempted with merchant account: ${loginDto.email}`);
      throw new UnauthorizedException('This email is registered as a merchant. Please use Merchant login to continue.');
    }

    if (user.isBanned) {
      // Check if banUntil is set and in the future
      if (user.banUntil && new Date(user.banUntil) > new Date()) {
        const until = new Date(user.banUntil);
        const daysLeft = Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        this.logger.warn(`Login failed - user is suspended until ${until.toISOString()}: ${loginDto.email}`);
        throw new ForbiddenException(`Your account is suspended until ${until.toLocaleDateString()} (${daysLeft} day(s) left). Reason: ${user.banReason || 'No reason provided'}`);
      } else {
        // Ban expired, auto-unban
        await this.userModel.findByIdAndUpdate(user._id, { $set: { isBanned: false, banReason: null, banUntil: null } });
      }
    }

    if (user.accountType === 'merchant' && user.role !== UserRole.ADMIN && user.role !== UserRole.MERCHANT) {
      user.role = UserRole.MERCHANT;
      await user.save();
    }

    // Auto-promote to admin if email matches config
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase() && user.role !== UserRole.ADMIN) {
      this.logger.log(`Auto-promoting ${user.email} to ADMIN based on config`);
      user.role = UserRole.ADMIN;
      await user.save();
    }

    // Generate tokens
    const payload = { sub: user._id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRATION') || '15m',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
    });

    // Save refresh token
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $push: { refreshTokens: refreshToken },
        $set: { 'metadata.lastLoginAt': new Date(), 'metadata.lastLoginIp': ip },
      }
    ).exec();

    // Emit Kafka event
    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.USER_LOGGED_IN, {
        userId: user._id,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn('Kafka disabled - USER_LOGGED_IN event skipped');
    }

    this.logger.log(`Login successful: ${user.email}`);

    const merchantProfile = user.accountType === 'merchant'
      ? await this.merchantModel.findOne({ userId: user._id.toString() }).lean().exec()
      : null;

    return {
      accessToken,
      refreshToken,
      user: this.toResponseDto(user, merchantProfile),
    };
  }

  async socialAuth(
    socialAuthDto: SocialAuthDto,
    ip?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: UserResponseDto }> {
    this.logger.log(`Social auth: ${socialAuthDto.email} via ${socialAuthDto.provider}`);

    let user = await this.userModel.findOne({ email: socialAuthDto.email }).exec();

    if (!user) {
      const generatedPassword = await bcrypt.hash(
        `social_${socialAuthDto.provider}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        10,
      );

      user = await this.userModel.create({
        name: socialAuthDto.name,
        email: socialAuthDto.email,
        password: generatedPassword,
        role: UserRole.USER,
        isEmailVerified: true,
        profile: {
          phone: socialAuthDto.phone,
        },
        metadata: {
          registeredIp: ip || '0.0.0.0',
        },
        refreshTokens: [],
      });

      if (this.kafkaService) {
        await this.kafkaService.emit(KAFKA_TOPICS.USER_REGISTERED, {
          userId: user._id,
          email: user.email,
          role: user.role,
          provider: socialAuthDto.provider,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const payload = { sub: user._id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRATION') || '15m',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
    });

    await this.userModel
      .updateOne(
        { _id: user._id },
        {
          $push: { refreshTokens: refreshToken },
          $set: {
            isEmailVerified: true,
            name: user.name || socialAuthDto.name,
            'profile.phone': user.profile?.phone || socialAuthDto.phone,
            'metadata.lastLoginAt': new Date(),
            'metadata.lastLoginIp': ip,
          },
        },
      )
      .exec();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.USER_LOGGED_IN, {
        userId: user._id,
        email: user.email,
        provider: socialAuthDto.provider,
        timestamp: new Date().toISOString(),
      });
    }

    const refreshedUser = await this.userModel.findById(user._id).exec();

    return {
      accessToken,
      refreshToken,
      user: this.toResponseDto(refreshedUser || user),
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.userModel.findById(payload.sub).exec();
      if (!user || !user.refreshTokens.includes(refreshToken)) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = { sub: user._id, email: user.email, role: user.role };
      const accessToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION') || '15m',
      });

      return { accessToken };
    } catch (error) {
      this.logger.error(`Refresh token failed: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    this.logger.log(`Logout user: ${userId}`);
    
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { refreshTokens: refreshToken } }
    ).exec();

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.USER_LOGGED_OUT, {
        userId,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn('Kafka disabled - USER_LOGGED_OUT event skipped');
    }
  }

  // ==================== USER METHODS ====================

  async getProfile(userId: string): Promise<UserResponseDto> {
    this.logger.log(`Getting profile for user: ${userId}`);
    
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const merchantProfile = user.accountType === 'merchant'
      ? await this.merchantModel.findOne({ userId: user._id.toString() }).lean().exec()
      : null;
    return this.toResponseDto(user, merchantProfile);
  }

  async getMerchantProfile(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    if (user.accountType !== 'merchant') {
      throw new ForbiddenException('Merchant access required');
    }

    let merchant = await this.merchantModel.findOne({ userId: user._id.toString() }).exec();
    if (!merchant) {
      // Auto-create merchant profile to avoid 404s in the frontend
      merchant = await this.merchantModel.create({
        userId: user._id.toString(),
        storeName: user.name || '',
        storeEmail: user.email || '',
        status: 'active',
      });
    }
    return merchant.toObject ? merchant.toObject() : merchant;
  }

  async updateProfile(userId: string, updateData: any): Promise<UserResponseDto> {
    this.logger.log(`Updating profile for user: ${userId}`);
    this.logger.debug(`Update data received: ${JSON.stringify(updateData).substring(0, 200)}...`);
    
    // Check if email is being changed and if it's already taken
    if (updateData.email) {
      this.logger.log(`Checking if email ${updateData.email} is already in use`);
      const existingUser = await this.userModel.findOne({ 
        email: updateData.email,
        _id: { $ne: userId }
      }).exec();
      
      if (existingUser) {
        throw new ConflictException('Email is already in use');
      }
    }
    
    // Validate profile photo size (max 2MB)
    if (updateData.profilePhoto) {
      const photoSize = Buffer.byteLength(updateData.profilePhoto, 'utf8');
      const maxSizeMB = 2;
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      
      if (photoSize > maxSizeBytes) {
        this.logger.warn(`Profile photo too large: ${(photoSize / 1024 / 1024).toFixed(2)}MB`);
        throw new BadRequestException(`Profile photo must be less than ${maxSizeMB}MB. Current size: ${(photoSize / 1024 / 1024).toFixed(2)}MB`);
      }
      this.logger.debug(`Profile photo size: ${(photoSize / 1024).toFixed(2)}KB - OK`);
    }
    
    // Only allow updating specific fields
    const allowedUpdates: any = {};
    
    if (updateData.name) allowedUpdates.name = updateData.name;
    if (updateData.email) allowedUpdates.email = updateData.email;
    if (updateData.profilePhoto) allowedUpdates.profilePhoto = updateData.profilePhoto;
    if (updateData.profile?.phone) allowedUpdates['profile.phone'] = updateData.profile.phone;
    if (updateData.profile?.address) allowedUpdates['profile.address'] = updateData.profile.address;
    if (updateData.profile?.city) allowedUpdates['profile.city'] = updateData.profile.city;
    if (updateData.profile?.state) allowedUpdates['profile.state'] = updateData.profile.state;
    if (updateData.profile?.pincode) allowedUpdates['profile.pincode'] = updateData.profile.pincode;
    if (updateData.profile?.avatar) allowedUpdates['profile.avatar'] = updateData.profile.avatar;
    if (updateData.profile?.bio) allowedUpdates['profile.bio'] = updateData.profile.bio;
    if (updateData.profile?.interests && Array.isArray(updateData.profile.interests)) {
      allowedUpdates['profile.interests'] = updateData.profile.interests;
    }
    
    // Bug Fix #2: Validate preferredCategories
    if (updateData.preferredCategories !== undefined) {
      if (Array.isArray(updateData.preferredCategories)) {
        // Validate categories
        const validation = validatePreferredCategories(updateData.preferredCategories);
        if (!validation.valid) {
          const errorMsg = validation.errors.join('; ');
          this.logger.warn(`Invalid categories provided: ${errorMsg}`);
          throw new BadRequestException(`Invalid preferred categories: ${errorMsg}`);
        }
        
        // Normalize: remove duplicates and ensure valid format
        const normalizedCategories = normalizeCategories(updateData.preferredCategories);
        allowedUpdates['preferredCategories'] = normalizedCategories;
        this.logger.debug(`Normalized ${updateData.preferredCategories.length} categories → ${normalizedCategories.length}`);
      } else if (updateData.preferredCategories === null) {
        // Allow clearing categories
        allowedUpdates['preferredCategories'] = [];
      } else {
        throw new BadRequestException('preferredCategories must be an array');
      }
    }

    this.logger.debug(`Updates to apply: ${JSON.stringify(Object.keys(allowedUpdates))}`);

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { ...allowedUpdates, updatedAt: new Date() } },
      { new: true }
    ).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (this.redisService && allowedUpdates.preferredCategories) {
      await this.redisService.deleteByPattern(`reco:deals:user:${userId}:*`);
    }

    this.logger.log(`Profile updated successfully for user: ${userId}`);
    this.logger.debug(`Updated fields: ${JSON.stringify(Object.keys(allowedUpdates))}`);
    
    return this.toResponseDto(user);
  }

  async findById(userId: string): Promise<UserResponseDto> {
    try {
      this.logger.log(`Find by ID: ${userId}`);
      
      // Check if userId is a valid ObjectId format
      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid user ID format');
      }
      
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      return this.toResponseDto(user);
    } catch (error) {
      if (error.name === 'CastError') {
        throw new BadRequestException('Invalid user ID format');
      }
      this.logger.error(`Error in findById: ${error.message}`);
      throw error;
    }
  }

  // 🔴 FIXED: getUserById method with proper logging
  async getUserById(userId: string): Promise<UserResponseDto> {
    try {
      this.logger.log(`Getting user by ID: ${userId}`);
      
      // Check if userId is a valid ObjectId format
      if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
        this.logger.warn(`Invalid user ID format: ${userId}`);
        throw new BadRequestException('Invalid user ID format');
      }
      
      // Find user in database
      const user = await this.userModel.findById(userId).exec();
      
      // Check if user exists
      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      
      this.logger.log(`User found: ${user.email}`);
      return this.toResponseDto(user);
      
    } catch (error) {
      // Handle different types of errors
      if (error.name === 'CastError') {
        this.logger.error(`Cast error for ID ${userId}`);
        throw new BadRequestException('Invalid user ID format');
      }
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      this.logger.error(`Unexpected error getting user ${userId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to get user');
    }
  }

  async findByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.userModel.findOne({ email }).exec();
    return user ? this.toResponseDto(user) : null;
  }

  async getAllUsers(page: number = 1, limit: number = 10): Promise<{ users: UserResponseDto[]; total: number }> {
    this.logger.log(`Getting all users - Page: ${page}, Limit: ${limit}`);
    
    const skip = (page - 1) * limit;
    
    const [users, total] = await Promise.all([
      this.userModel
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments()
    ]);

    return {
      users: users.map(user => this.toResponseDto(user)),
      total,
    };
  }

  // ==================== ADMIN METHODS ====================

  async adminGetAllUsers(page: number = 1, limit: number = 10): Promise<{ users: UserResponseDto[]; total: number }> {
    this.logger.log(`Admin getting all users - Page: ${page}, Limit: ${limit}`);
    return this.getAllUsers(page, limit);
  }

  async adminGetUserById(userId: string): Promise<UserResponseDto> {
    this.logger.log(`Admin getting user by ID: ${userId}`);
    return this.findById(userId);
  }

  async adminUpdateUser(userId: string, updateData: any, adminId: string, adminEmail: string): Promise<UserResponseDto> {
    this.logger.log(`Admin updating user: ${userId}`);
    
    // Admin can update any field
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { ...updateData, updatedAt: new Date() } },
      { new: true }
    ).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.auditLogsService.log({
      action: 'USER_UPDATED',
      adminId,
      adminEmail,
      targetId: userId,
      targetType: 'User',
      details: { updatedFields: updateData }
    });

    return this.toResponseDto(user);
  }

  async adminDeleteUser(userId: string, adminId: string, adminEmail: string): Promise<void> {
    this.logger.log(`Admin deleting user: ${userId}`);
    
    const result = await this.userModel.deleteOne({ _id: userId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('User not found');
    }

    await this.auditLogsService.log({
      action: 'USER_DELETED',
      adminId,
      adminEmail,
      targetId: userId,
      targetType: 'User'
    });

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.USER_DELETED, {
        userId,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn('Kafka disabled - USER_DELETED event skipped');
    }
  }

  /**
   * Ban a user for a given duration (in days). If duration is not provided, ban is permanent.
   */
  async banUser(userId: string, reason: string, adminId: string, adminEmail: string, durationDays?: number): Promise<UserResponseDto> {
    this.logger.log(`Admin banning user: ${userId} for ${durationDays || 'permanent'} days`);
    let banUntil: Date | null = null;
    if (durationDays && durationDays > 0) {
      banUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { isBanned: true, banReason: reason, banUntil: banUntil, updatedAt: new Date() } },
      { new: true }
    ).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.auditLogsService.log({
      action: 'USER_BANNED',
      adminId,
      adminEmail,
      targetId: userId,
      targetType: 'User',
      details: { reason, banUntil }
    });

    return this.toResponseDto(user);
  }

  async unbanUser(userId: string, adminId: string, adminEmail: string): Promise<UserResponseDto> {
    this.logger.log(`Admin unbanning user: ${userId}`);
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { isBanned: false, banReason: null, banUntil: null, updatedAt: new Date() } },
      { new: true }
    ).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.auditLogsService.log({
      action: 'USER_UNBANNED',
      adminId,
      adminEmail,
      targetId: userId,
      targetType: 'User'
    });

    return this.toResponseDto(user);
  }

  async adminGetStats(): Promise<any> {
    this.logger.log('Admin getting stats');
    
    const totalUsers = await this.userModel.countDocuments();
    const totalAdmins = await this.userModel.countDocuments({ role: UserRole.ADMIN });
    const totalRegularUsers = await this.userModel.countDocuments({ role: UserRole.USER });
    const recentUsers = await this.userModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .exec();

    // Fetch ads-related stats if AdsService is available
    let pendingReports = 0;
    let totalAds = 0;
    if (this.adsService) {
      try {
        pendingReports = await this.adsService.getPendingReportsCount();
        totalAds = await this.adsService.getTotalAdsCount();
      } catch (error) {
        this.logger.warn(`Failed to fetch ads stats: ${error.message}`);
      }
    }

    return {
      totalUsers,
      totalAdmins,
      totalRegularUsers,
      pendingReports,
      totalAds,
      recentUsers: recentUsers.map(u => this.toResponseDto(u)),
    };
  }

  async getDashboardStatsPublic(): Promise<any> {
    this.logger.log('Fetching public dashboard stats');

    const totalUsersPromise = this.userModel.countDocuments();
    const activeMerchantsPromise = this.userModel.countDocuments({
      role: UserRole.MERCHANT,
      isBanned: { $ne: true },
    });

    const [totalUsers, activeMerchants] = await Promise.all([
      totalUsersPromise,
      activeMerchantsPromise,
    ]);

    let totalListings = 0;
    let pendingApprovals = 0;
    let overallReports = 0;

    if (this.adsService) {
      try {
        const [adsCount, pendingReports, reportsCount] = await Promise.all([
          this.adsService.getTotalAdsCount(),
          this.adsService.getPendingReportsCount(),
          this.adsService.getTotalReportsCount(),
        ]);

        totalListings = adsCount;
        pendingApprovals = pendingReports;
        overallReports = reportsCount;
      } catch (error) {
        this.logger.warn(`Failed to fetch ads dashboard stats: ${error.message}`);
      }
    }

    let platformRevenue = 0;
    if (this.paymentModel) {
      try {
        const revenueAgg = await this.paymentModel.aggregate([
          {
            $match: {
              status: {
                $in: [
                  PaymentStatus.CREATED,
                  PaymentStatus.AUTHORIZED,
                  PaymentStatus.CAPTURED,
                  PaymentStatus.PARTIALLY_REFUNDED,
                ],
              },
            },
          },
          {
            $project: {
              grossInPaise: {
                $ifNull: [
                  '$amountInPaise',
                  { $multiply: [{ $ifNull: ['$amount', 0] }, 100] },
                ],
              },
              refundedInPaise: { $ifNull: ['$refundedAmountInPaise', 0] },
            },
          },
          {
            $group: {
              _id: null,
              grossInPaise: { $sum: '$grossInPaise' },
              refundedInPaise: { $sum: '$refundedInPaise' },
            },
          },
        ]);

        const grossInPaise = Number(revenueAgg?.[0]?.grossInPaise || 0);
        const refundedInPaise = Number(revenueAgg?.[0]?.refundedInPaise || 0);
        const netInPaise = Math.max(grossInPaise - refundedInPaise, 0);
        platformRevenue = netInPaise / 100;
      } catch (error) {
        this.logger.warn(`Failed to fetch payment dashboard stats: ${error.message}`);
      }
    }

    return {
      totalUsers,
      activeMerchants,
      totalListings,
      pendingApprovals,
      overallReports,
      platformRevenue,
      updatedAt: new Date().toISOString(),
    };
  }

  // ==================== PASSWORD CHANGE with OTP ====================

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendPasswordChangeOTP(userId: string): Promise<any> {
    this.logger.log(`Sending password change OTP email for user: ${userId}`);
    
    try {
      // Validate userId - handle both string and ObjectId
      if (!userId) {
        throw new BadRequestException('User ID is required');
      }
      
      const userIdStr = userId.toString();
      this.logger.debug(`Processing userId: ${userIdStr}`);

      // Get full user document with all fields
      const user = await this.userModel.findById(userIdStr).exec();
      if (!user) {
        this.logger.warn(`User not found with ID: ${userIdStr}`);
        throw new NotFoundException('User not found');
      }
      
      this.logger.debug(`User found: ${user.email}`);
      this.logger.debug(`User email: ${user.email || 'NOT SET'}`);
      
      if (!user.email) {
        throw new BadRequestException('Registered email not found for this account.');
      }

      const otp = this.generateOTP();
      const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Save OTP and reset verification status
      await this.userModel.findByIdAndUpdate(
        userIdStr,
        {
          $set: {
            passwordChangeOTP: otp,
            passwordChangeOTPExpiry: expiryTime,
            passwordChangeOTPVerified: false,
            updatedAt: new Date(),
          }
        },
        { new: true }
      ).exec();

      this.ensureOtpMailerReady();

      if (!this.mailTransporter || !this.mailFrom) {
        throw new InternalServerErrorException('Email service not configured. Please contact support.');
      }

      await this.mailTransporter.sendMail({
        from: this.mailFrom,
        to: user.email,
        subject: 'GOLO Password Change OTP',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #157A4F; margin-bottom: 12px;">GOLO Password Verification</h2>
            <p style="margin-bottom: 16px; color: #333;">Use this OTP to verify your password change request:</p>
            <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #111; margin: 18px 0;">${otp}</div>
            <p style="color: #555; margin-bottom: 8px;">This OTP is valid for 5 minutes.</p>
            <p style="color: #777; font-size: 13px;">If you did not request this, please ignore this email.</p>
          </div>
        `,
      });

      this.logger.log(`OTP email sent successfully to ${user.email}`);

      return {
        message: 'OTP sent to your registered email address',
        expiresIn: 300, // 5 minutes in seconds
      };
    } catch (error) {
      this.logger.error(`Error in sendPasswordChangeOTP: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }

  async verifyPasswordChangeOTP(userId: string, otp: string): Promise<any> {
    this.logger.log(`Verifying password change OTP for user: ${userId}`);
    
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordChangeOTP) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    if (new Date() > user.passwordChangeOTPExpiry) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    if (user.passwordChangeOTP !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Mark OTP as verified
    await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          passwordChangeOTPVerified: true,
          updatedAt: new Date(),
        }
      }
    ).exec();

    return { message: 'OTP verified successfully' };
  }

  async changePasswordWithOTP(userId: string, otp: string, newPassword: string): Promise<UserResponseDto> {
    this.logger.log(`Changing password with OTP for user: ${userId}`);
    
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordChangeOTPVerified) {
      throw new BadRequestException('OTP not verified. Please verify OTP first.');
    }

    if (user.passwordChangeOTP !== otp) {
      throw new UnauthorizedException('OTP mismatch');
    }

    if (new Date() > user.passwordChangeOTPExpiry) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    const isCurrentPassword = await bcrypt.compare(newPassword, user.password);
    if (isCurrentPassword) {
      throw new BadRequestException('New password cannot be the same as your current password.');
    }

    const passwordHistory = Array.isArray(user.passwordHistory) ? user.passwordHistory : [];
    for (const oldPasswordHash of passwordHistory) {
      const isReusedPassword = await bcrypt.compare(newPassword, oldPasswordHash);
      if (isReusedPassword) {
        throw new BadRequestException('Previously used passwords are not allowed. Please choose a different password.');
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          password: hashedPassword,
          passwordChangeOTP: null,
          passwordChangeOTPExpiry: null,
          passwordChangeOTPVerified: false,
          updatedAt: new Date(),
        },
        $push: {
          passwordHistory: {
            $each: [user.password],
            $slice: -5,
          },
        },
      },
      { new: true }
    ).exec();

    this.logger.log(`Password changed successfully for user: ${userId}`);

    return this.toResponseDto(updatedUser);
  }

  async changePasswordDirect(userId: string, currentPassword: string, newPassword: string): Promise<UserResponseDto> {
    this.logger.log(`Changing password directly for user: ${userId}`);
    
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current password and new password are required');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check if new password is the same as current
    const isCurrentPassword = await bcrypt.compare(newPassword, user.password);
    if (isCurrentPassword) {
      throw new BadRequestException('New password cannot be the same as your current password.');
    }

    // Check password history
    const passwordHistory = Array.isArray(user.passwordHistory) ? user.passwordHistory : [];
    for (const oldPasswordHash of passwordHistory) {
      const isReusedPassword = await bcrypt.compare(newPassword, oldPasswordHash);
      if (isReusedPassword) {
        throw new BadRequestException('Previously used passwords are not allowed. Please choose a different password.');
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
        $push: {
          passwordHistory: {
            $each: [user.password],
            $slice: -5,
          },
        },
      },
      { new: true }
    ).exec();

    this.logger.log(`Password changed successfully for user: ${userId}`);

    return this.toResponseDto(updatedUser);
  }

  // ==================== WISHLIST METHODS ====================

  async toggleWishlist(userId: string, adId: string): Promise<{ wishlist: string[], added: boolean }> {
    this.logger.log(`Toggling wishlist for user: ${userId}, ad: ${adId}`);
    
    if (!adId) {
      throw new BadRequestException('Ad ID is required');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let wishlist = user.wishlist || [];
    let added = false;

    if (wishlist.includes(adId)) {
      wishlist = wishlist.filter(id => id !== adId);
    } else {
      wishlist.push(adId);
      added = true;
    }

    await this.userModel.findByIdAndUpdate(userId, { wishlist }).exec();

    // Persist lifetime like history in DB for merchant analytics.
    if (added) {
      try {
        await this.upsertOfferLikeHistory(userId, user.name || 'Anonymous', adId);
      } catch (historyError: any) {
        this.logger.warn(`Failed to store offer lifetime like history: ${historyError?.message || 'unknown error'}`);
      }
    }

    // Create notification for the ad owner when someone adds to wishlist
    if (added && this.adsService) {
      try {
        const ad = await this.adsService.getAdById(adId);
        const adOwnerId = (ad as any).userId?.toString();
        if (adOwnerId && adOwnerId !== userId) {
          await this.notificationModel.create({
            recipientId: adOwnerId,
            senderId: userId,
            senderName: user.name,
            adId,
            adTitle: (ad as any).title || 'your ad',
            type: 'wishlist_add',
            message: `${user.name} wishlisted your ad "${(ad as any).title || 'your ad'}"`,
            read: false,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to create wishlist notification: ${err.message}`);
      }
    }

    return { wishlist, added };
  }

  private async upsertOfferLikeHistory(
    userId: string,
    userName: string,
    offerId: string,
    likedProduct?: any,
  ): Promise<void> {
    if (!this.offerLikeHistoryModel || !this.offerPromotionModel || !offerId) return;

    const query: any = { requestId: offerId };
    if (isValidObjectId(offerId)) {
      query.$or = [{ _id: offerId }, { requestId: offerId }];
      delete query.requestId;
    }

    const offer = await this.offerPromotionModel
      .findOne(query)
      .select('_id requestId merchantId title category selectedProducts')
      .lean()
      .exec();

    if (!offer) return;

    const baseProducts = Array.isArray((offer as any).selectedProducts) ? (offer as any).selectedProducts : [];
    const mergedProducts = [...baseProducts];
    if (likedProduct && (likedProduct.productId || likedProduct.id || likedProduct.productName || likedProduct.name)) {
      const candidateId = String(likedProduct.productId || likedProduct.id || '').trim();
      const candidateName = String(likedProduct.productName || likedProduct.name || '').trim();
      const exists = mergedProducts.some((p: any) =>
        String(p?.productId || p?.id || '').trim() === candidateId ||
        String(p?.productName || p?.name || '').trim() === candidateName,
      );
      if (!exists) {
        mergedProducts.push({
          productId: candidateId || candidateName,
          productName: candidateName || 'Product',
          name: candidateName || 'Product',
          category: likedProduct.category || '',
          imageUrl: likedProduct.imageUrl || likedProduct.image || '',
          offerPrice: Number(likedProduct.offerPrice || likedProduct.price || 0),
          originalPrice: Number(likedProduct.originalPrice || 0),
        });
      }
    }

    await this.offerLikeHistoryModel.updateOne(
      {
        userId: String(userId),
        offerPublicId: String((offer as any)._id),
      },
      {
        $setOnInsert: {
          userId: String(userId),
          userName: userName || 'Anonymous',
          merchantId: String((offer as any).merchantId || ''),
          offerPublicId: String((offer as any)._id),
          offerRequestId: String((offer as any).requestId || ''),
          offerTitle: String((offer as any).title || ''),
          offerCategory: String((offer as any).category || ''),
          firstLikedAt: new Date(),
        },
        $set: {
          selectedProducts: mergedProducts,
        },
      },
      { upsert: true },
    ).exec();
  }

  async likeProduct(
    userId: string,
    offerId: string,
    product: any,
  ): Promise<{ wishlist: string[]; liked: boolean }> {
    if (!offerId) {
      throw new BadRequestException('Offer ID is required to like a product');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wishlist = Array.isArray(user.wishlist) ? [...user.wishlist] : [];
    let liked = false;
    if (!wishlist.includes(offerId)) {
      wishlist.push(offerId);
      await this.userModel.findByIdAndUpdate(userId, { wishlist }).exec();
      liked = true;
    }

    await this.upsertOfferLikeHistory(userId, user.name || 'Anonymous', offerId, product);
    return { wishlist, liked: true };
  }

  async getNotifications(userId: string, page = 1, limit = 20): Promise<{ notifications: any[]; unreadCount: number }> {
    const skip = (page - 1) * limit;
    const [notifications, unreadCount] = await Promise.all([
      this.notificationModel
        .find({ recipientId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.notificationModel.countDocuments({ recipientId: userId, read: false }),
    ]);
    return { notifications, unreadCount };
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipientId: userId },
      { $set: { read: true } },
    ).exec();
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { recipientId: userId, read: false },
      { $set: { read: true } },
    ).exec();
  }

  async deleteAllNotifications(userId: string): Promise<void> {
    await this.notificationModel.deleteMany({ recipientId: userId }).exec();
  }

  async saveIWantPreference(
    userId: string,
    payload: { category: string; title?: string; description?: string },
  ): Promise<any> {
    const category = String(payload?.category || '').trim();
    const title = String(payload?.title || '').trim();
    const description = String(payload?.description || '').trim();

    if (!category) {
      throw new BadRequestException('Category is required');
    }

    if (!title && !description) {
      throw new BadRequestException('Title or description is required');
    }

    const existingUser = await this.userModel.findById(userId).exec();
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const currentCreatedAt = existingUser.iWantPreference?.createdAt || new Date();

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: {
            iWantPreference: {
              category,
              title,
              description,
              createdAt: currentCreatedAt,
              updatedAt: new Date(),
            },
            updatedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.iWantPreference;
  }

  async getIWantPreference(userId: string): Promise<any | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.iWantPreference || null;
  }

  async getWishlistIds(userId: string): Promise<string[]> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.wishlist || [];
  }

  async getMerchantLikedProducts(merchantId: string, limit = 10) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
    if (!this.offerLikeHistoryModel) {
      return { offers: [], products: [] };
    }

    const likes = await this.offerLikeHistoryModel
      .find({ merchantId: String(merchantId) })
      .sort({ firstLikedAt: -1 })
      .lean()
      .exec();

    if (!likes.length) {
      return { offers: [], products: [] };
    }

    const offerMap = new Map<string, any>();
    for (const row of likes as any[]) {
      const offerKey = String(row.offerPublicId || row.offerRequestId || '');
      if (!offerKey) continue;

      if (!offerMap.has(offerKey)) {
        offerMap.set(offerKey, {
          offerId: offerKey,
          requestId: String(row.offerRequestId || ''),
          name: String(row.offerTitle || 'Untitled Offer'),
          type: String(row.offerCategory || 'General'),
          image: '/images/deal2.avif',
          likes: 0,
          customerSet: new Set<string>(),
          selectedProducts: Array.isArray(row.selectedProducts) ? row.selectedProducts : [],
        });
      }

      const offerEntry = offerMap.get(offerKey);
      offerEntry.likes += 1;
      if (row.userName) {
        offerEntry.customerSet.add(String(row.userName));
      }
      if ((!offerEntry.selectedProducts || !offerEntry.selectedProducts.length) && Array.isArray(row.selectedProducts)) {
        offerEntry.selectedProducts = row.selectedProducts;
      }
    }

    const offers = Array.from(offerMap.values())
      .map((item) => {
        const customers = Array.from(item.customerSet).slice(0, 4);
        return {
          offerId: item.offerId,
          requestId: item.requestId,
          name: item.name,
          type: item.type,
          image: item.image,
          likes: item.likes,
          customerCount: item.customerSet.size,
          customers: customers.join(', '),
          selectedProducts: item.selectedProducts || [],
        };
      })
      .sort((a, b) => b.likes - a.likes)
      .slice(0, safeLimit);

    const productMap = new Map<string, any>();
    for (const offer of offers) {
      const products = Array.isArray(offer.selectedProducts) ? offer.selectedProducts : [];
      for (const product of products) {
        const key = String(product?.productId || product?.id || product?.productName || product?.name || '').trim();
        if (!key) continue;

        if (!productMap.has(key)) {
          productMap.set(key, {
            productId: key,
            name: String(product?.productName || product?.name || 'Untitled Product'),
            type: String(product?.category || offer.type || 'General'),
            image: String(product?.imageUrl || '/images/deal2.avif'),
            likes: 0,
            customerSet: new Set<string>(),
            offerName: offer.name,
          });
        }

        const productEntry = productMap.get(key);
        productEntry.likes += offer.likes;
        const offerCustomers = offer.customers ? String(offer.customers).split(',').map((name) => name.trim()).filter(Boolean) : [];
        for (const customer of offerCustomers) {
          productEntry.customerSet.add(customer);
        }
      }
    }

    const products = Array.from(productMap.values())
      .map((item) => ({
        productId: item.productId,
        name: item.name,
        type: item.type,
        image: item.image,
        likes: item.likes,
        customerCount: item.customerSet.size,
        customers: Array.from(item.customerSet).slice(0, 4).join(', '),
        offerName: item.offerName,
      }))
      .sort((a, b) => b.likes - a.likes)
      .slice(0, safeLimit);

    return { offers, products };
  }

  async getWishlistAds(userId: string): Promise<any[]> {
    const ids = await this.getWishlistIds(userId);
    if (!ids || ids.length === 0) return [];

    const ads: any[] = [];
    const offers: any[] = [];

    // Fetch Ads
    for (const id of ids) {
      try {
        const ad = await this.adsService?.getAdById(id);
        if (ad) {
          const adData =
            typeof (ad as any).toObject === 'function' ? (ad as any).toObject() : ad;
          ads.push({ ...adData, _type: 'ad' });
        }
      } catch (error) {
        // Not an ad ID, try offer next
      }
    }

    // Fetch Offers (OfferPromotion) for IDs not found as Ads
    const foundAdIds = new Set(
      ads.flatMap(ad => [String(ad._id), String(ad.adId)].filter(Boolean)),
    );
    const remainingIds = ids.filter(id => !foundAdIds.has(id));
    for (const id of remainingIds) {
      try {
        const offer = await this.offerPromotionModel?.findById(id).lean().exec();
        if (offer) {
          offers.push({
            ...offer,
            _type: 'offer',
            adId: String(offer._id),
            title: offer.title,
            price: offer.totalPrice,
            images: offer.imageUrl ? [offer.imageUrl] : [],
            category: offer.category,
            merchant: {
              name: offer.merchantName,
            },
          });
        }
      } catch (error) {
        this.logger.warn(`Offer ${id} not found in wishlist context: ${error.message}`);
      }
    }

    // Combine and sort by createdAt descending (newest first)
    const combined = [...ads, ...offers].sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );

    return combined;
  }

  // ==================== USER REPORT METHODS ====================

  async submitUserReport(
    reportedUserId: string,
    reporterUserId: string,
    reason: string,
    description?: string,
    evidenceUrls?: string[],
  ) {
    try {
      const reportedUser = await this.userModel.findById(reportedUserId);
      if (!reportedUser) {
        throw new NotFoundException('Reported user not found');
      }

      const reportId = `REP-USR-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      const newReport = await this.userReportModel.create({
        reportId,
        reportedUserId,
        reportedBy: reporterUserId,
        reason,
        description,
        evidenceUrls,
        status: 'pending',
        priority: 0,
      });

      this.logger.log(`User report ${reportId} submitted by ${reporterUserId} against ${reportedUserId}`);

      return {
        reportId,
        message: 'Report submitted successfully',
        success: true,
      };
    } catch (error) {
      this.logger.error(`Error submitting user report: ${error.message}`);
      throw error;
    }
  }

  async getAllUserReports(limit = 50, skip = 0) {
    try {
      const reports = await this.userReportModel
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      const total = await this.userReportModel.countDocuments();

      // Helper to map reason enum to label
      const reasonLabels: Record<string, string> = {
        harassment: 'Harassment',
        abuse: 'Abuse',
        fraud: 'Fraud',
        scam: 'Scam',
        fake_account: 'Fake Account',
        spam: 'Spam',
        other: 'Other',
      };

      // Fetch user names for reportedUserId and reportedBy
      const userIds = Array.from(new Set([
        ...reports.map((r: any) => r.reportedUserId),
        ...reports.map((r: any) => r.reportedBy),
      ].filter(Boolean)));

      const users = await this.userModel.find({ _id: { $in: userIds } }).lean();
      const userMap = new Map(users.map((u: any) => [u._id.toString(), u.name]));

      const formattedReports = reports.map((report: any) => ({
        id: report._id?.toString() || '',
        reportId: report.reportId || '',
        entity: userMap.get(report.reportedUserId) || `User ${report.reportedUserId?.slice(0, 8)}...`,
        by: userMap.get(report.reportedBy) || `by ${report.reportedBy?.slice(0, 8) || 'Unknown User'}...`,
        type: reasonLabels[report.reason] || 'Other',
        priority: report.priority === 0 ? 'Medium' : 'High',
        status: report.status || 'Pending',
        createdAt: report.createdAt,
      }));

      return {
        success: true,
        data: formattedReports,
        total,
        limit,
        skip,
      };
    } catch (error) {
      this.logger.error(`Error fetching user reports: ${error.message}`);
      throw error;
    }
  }

  async getUserReportById(reportId: string) {
    try {
      const report = await this.userReportModel.findOne({ reportId });

      if (!report) {
        throw new NotFoundException('Report not found');
      }

      const reportedUser = await this.userModel.findById(report.reportedUserId);

      return {
        success: true,
        data: {
          reportId: report.reportId,
          reportedUser: {
            id: reportedUser?._id?.toString(),
            name: reportedUser?.name,
            email: reportedUser?.email,
          },
          reason: report.reason,
          description: report.description,
          evidenceUrls: report.evidenceUrls || [],
          status: report.status,
          priority: report.priority,
          createdAt: report.createdAt,
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching report: ${error.message}`);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  async getUsersByRole(role: string, page: number = 1, limit: number = 10, kycStatus?: string): Promise<{ users: any[]; total: number }> {
    this.logger.log(`Getting users by role: ${role}, page: ${page}, limit: ${limit}, kycStatus: ${kycStatus}`);
    
    const query: any = { role };
    if (kycStatus) {
      query.kycStatus = kycStatus;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users: users.map((user: any) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus || 'Pending',
        city: user.profile?.city || '',
        joinedDate: user.createdAt,
        status: user.isBanned ? 'Suspended' : 'Active',
        isBanned: user.isBanned,
      })),
      total,
    };
  }

  async updateUserKycStatus(userId: string, kycStatus: string, rejectionReason?: string, adminId?: string, adminEmail?: string): Promise<any> {
    this.logger.log(`Updating KYC status for user ${userId}: ${kycStatus}`);

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.kycStatus = kycStatus;
    if (rejectionReason && kycStatus === 'Rejected') {
      user.kycRejectionReason = rejectionReason;
    }

    await user.save();

    // Log audit if audit service available
    if (this.auditLogsService) {
      try {
        await this.auditLogsService.log({
          action: `Updated KYC status to ${kycStatus}`,
          adminId,
          adminEmail: adminEmail || 'unknown',
          targetId: userId,
          targetType: 'User',
          details: { previousStatus: user.kycStatus, newStatus: kycStatus, rejectionReason },
        });
      } catch (err) {
        this.logger.warn(`Failed to log KYC update: ${err.message}`);
      }
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      kycStatus: user.kycStatus,
      kycRejectionReason: user.kycRejectionReason,
    };
  }

  private toResponseDto(user: UserDocument, merchantProfile: any = null): UserResponseDto {
    const normalizedRole = user.role === UserRole.ADMIN
      ? UserRole.ADMIN
      : (user.accountType === 'merchant' ? UserRole.MERCHANT : user.role || UserRole.USER);

    // Loyalty tier logic
    const points = user.loyaltyPoints || 0;
    let loyaltyTier = 'Bronze';
    if (points >= 20000) loyaltyTier = 'Platinum';
    else if (points >= 5000) loyaltyTier = 'Gold';
    else if (points >= 1000) loyaltyTier = 'Silver';

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: normalizedRole,
      accountType: user.accountType || 'user',
      isBanned: user.isBanned || false,
      banReason: user.banReason,
      isEmailVerified: user.isEmailVerified || false,
      profile: user.profile || {},
      profilePhoto: user.profilePhoto || null,
      preferredCategories: Array.isArray(user.preferredCategories) ? user.preferredCategories : [],
      merchantProfile,
      iWantPreference: user.iWantPreference || null,
      createdAt: user.createdAt,
      loyaltyPoints: user.loyaltyPoints || 0,
      merchantLoyaltyPoints: user.merchantLoyaltyPoints || {},
      loyaltyTier,
    };
  }
}

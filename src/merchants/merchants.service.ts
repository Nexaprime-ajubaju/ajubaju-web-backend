import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { MerchantDailyView } from './schemas/merchant-daily-view.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { OTP, OTPDocument } from '../users/schemas/otp.schema';
import { UpdateStoreLocationDto } from '../users/dto/update-store-location.dto';
import { DeleteAccountDto } from '../users/dto/delete-account.dto';
import { DeletedAccount, DeletedAccountDocument } from '../users/schemas/deleted-account.schema';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    @InjectModel(Merchant.name) private merchantModel: Model<MerchantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(OTP.name) private otpModel: Model<OTPDocument>,
    @InjectModel(MerchantDailyView.name) private merchantDailyViewModel: Model<MerchantDailyView>,
    @Optional() @InjectConnection() private connection?: Connection,
    @Optional() private readonly redisService?: RedisService,
    @Optional() @InjectModel(DeletedAccount.name) private deletedAccountModel?: Model<DeletedAccountDocument>,
  ) {}

  /**
   * Update merchant store location with coordinates
   * @param userId - Merchant's user ID
   * @param locationData - Address, latitude, longitude
   * @returns Updated merchant data
   */
  async updateStoreLocation(
    userId: string,
    locationData: UpdateStoreLocationDto,
  ) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    // Validate coordinates
    if (
      typeof locationData.latitude !== 'number' ||
      typeof locationData.longitude !== 'number'
    ) {
      throw new BadRequestException('Invalid coordinates');
    }

    if (locationData.latitude < -90 || locationData.latitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }

    if (locationData.longitude < -180 || locationData.longitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }

    if (!locationData.address || locationData.address.trim().length === 0) {
      throw new BadRequestException('Address cannot be empty');
    }

    try {
      const merchant = await this.merchantModel.findOneAndUpdate(
        { userId },
        {
          storeLocation: locationData.address,
          storeLocationLatitude: locationData.latitude,
          storeLocationLongitude: locationData.longitude,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true },
      );

      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }

      return {
        success: true,
        data: {
          address: merchant.storeLocation,
          latitude: merchant.storeLocationLatitude,
          longitude: merchant.storeLocationLongitude,
          updatedAt: merchant.updatedAt,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to update store location: ${error.message}`,
      );
    }
  }

  /**
   * Get merchant store location
   * @param userId - Merchant's user ID
   * @returns Merchant store location with coordinates
   */
  async getStoreLocation(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const merchant = await this.merchantModel.findOne({ userId });

      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }

      return {
        success: true,
        data: {
          address: merchant.storeLocation || null,
          latitude: merchant.storeLocationLatitude || null,
          longitude: merchant.storeLocationLongitude || null,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve store location: ${error.message}`,
      );
    }
  }

  async getPublicMerchantProfile(merchantId: string) {
    if (!merchantId) {
      throw new BadRequestException('Merchant ID is required');
    }

    const merchant = await this.findPublicMerchantById(merchantId);
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    merchant.profileViews = (merchant.profileViews || 0) + 1;
    await merchant.save();

    const todayStr = new Date().toISOString().split('T')[0];
    await this.merchantDailyViewModel.updateOne(
      { merchantId: String(merchant._id), date: todayStr },
      { $inc: { views: 1 } },
      { upsert: true }
    );

    const data = merchant.toObject ? merchant.toObject() : merchant;

    return {
      success: true,
      data: {
        ...data,
        merchantId: data.userId,
      },
    };
  }

  async getPublicMerchantStoreLocation(merchantId: string) {
    if (!merchantId) {
      throw new BadRequestException('Merchant ID is required');
    }

    const merchant = await this.findPublicMerchantById(merchantId);
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return {
      success: true,
      data: {
        address: merchant.storeLocation || null,
        latitude: merchant.storeLocationLatitude || null,
        longitude: merchant.storeLocationLongitude || null,
      },
    };
  }

  async searchMerchants(query: string, page: number = 1, limit: number = 10) {
    const regex = new RegExp(query, 'i');
    const skip = (page - 1) * limit;

    const merchants = await this.merchantModel
      .find({
        $or: [
          { storeName: { $regex: regex } },
          { name: { $regex: regex } },
          { category: { $regex: regex } },
        ],
      })
      .skip(skip)
      .limit(limit)
      .select('userId storeName name profilePic category address storeLocation city')
      .lean()
      .exec();

    return {
      success: true,
      data: merchants.map(m => ({
        ...m,
        merchantId: m.userId,
      })),
    };
  }

  private findPublicMerchantById(merchantId: string) {
    const filters: any[] = [{ userId: merchantId }];

    if (Types.ObjectId.isValid(merchantId)) {
      filters.push({ _id: new Types.ObjectId(merchantId) });
    }

    return this.merchantModel.findOne({ $or: filters }).exec();
  }

  /**
   * Get nearby merchants (for future use)
   * @param latitude - Center latitude
   * @param longitude - Center longitude
   * @param radiusKm - Radius in kilometers
   * @returns Array of nearby merchants
   */
  async getNearbyMerchants(
    latitude: number,
    longitude: number,
    radiusKm: number = 10,
  ) {
    if (!latitude || !longitude || !radiusKm) {
      throw new BadRequestException(
        'Latitude, longitude, and radius are required',
      );
    }

    try {
      // Convert radius from km to radians (Earth's radius = 6371 km)
      const radiusRadians = radiusKm / 6371;

      const merchants = await this.merchantModel.find({
        $and: [
          { storeLocationLatitude: { $exists: true, $ne: null } },
          { storeLocationLongitude: { $exists: true, $ne: null } },
        ],
      });

      // Filter merchants based on distance (simple distance calculation)
      const nearbyMerchants = merchants.filter((merchant) => {
        const lat1 = latitude;
        const lon1 = longitude;
        const lat2 = merchant.storeLocationLatitude;
        const lon2 = merchant.storeLocationLongitude;

        // Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance <= radiusKm;
      });

      return {
        success: true,
        data: nearbyMerchants.map((m) => ({
          merchantId: m.userId,
          storeName: m.storeName,
          address: m.storeLocation,
          latitude: m.storeLocationLatitude,
          longitude: m.storeLocationLongitude,
        })),
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to find nearby merchants: ${error.message}`,
      );
    }
  }

  private normalizeEmail(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  /**
   * Update merchant profile information
   * @param userId - Merchant's user ID
   * @param updateData - Merchant profile data to update
   * @returns Updated merchant data
   */
  async updateMerchantProfile(userId: string, updateData: any) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const currentUser = await this.userModel.findById(userId).exec();
      if (!currentUser) {
        throw new NotFoundException('User not found');
      }
      if (currentUser.accountType !== 'merchant') {
        throw new BadRequestException('Merchant access required');
      }

      const merchant = await this.merchantModel.findOne({ userId }).exec();
      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }

      const allowedUpdates: any = {};
      let normalizedNewEmail: string | null = null;

      if (updateData.storeName) allowedUpdates.storeName = updateData.storeName;
      if (updateData.storeEmail) {
        normalizedNewEmail = this.normalizeEmail(updateData.storeEmail);
        const currentMerchantEmail = this.normalizeEmail(merchant.storeEmail || currentUser.email || '');

        if (!normalizedNewEmail) {
          throw new BadRequestException('Invalid email address');
        }

        if (normalizedNewEmail !== currentMerchantEmail) {
          const existingUser = await this.userModel.findOne({
            email: normalizedNewEmail,
            _id: { $ne: new Types.ObjectId(userId) },
            accountType: 'merchant',
          }).exec();

          if (existingUser) {
            throw new ConflictException('Email is already in use by another merchant account');
          }

          const verifiedOtp = await this.otpModel.findOne({
            email: normalizedNewEmail,
            verified: true,
            updatedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
          }).exec();

          if (!verifiedOtp) {
            throw new BadRequestException('New email has not been verified via OTP');
          }

          await this.otpModel.deleteOne({ email: normalizedNewEmail }).exec();
          allowedUpdates.storeEmail = normalizedNewEmail;
        }
      }
      if (updateData.gstNumber) allowedUpdates.gstNumber = updateData.gstNumber;
      if (updateData.contactNumber)
        allowedUpdates.contactNumber = updateData.contactNumber;
      if (updateData.storeCategory)
        allowedUpdates.storeCategory = updateData.storeCategory;
      if (updateData.storeSubCategory)
        allowedUpdates.storeSubCategory = updateData.storeSubCategory;
      if (updateData.storeLocation)
        allowedUpdates.storeLocation = updateData.storeLocation;
      if (updateData.profilePhoto)
        allowedUpdates.profilePhoto = updateData.profilePhoto;
      if (updateData.shopPhoto) allowedUpdates.shopPhoto = updateData.shopPhoto;

      allowedUpdates.updatedAt = new Date();

      const updatedMerchant = await this.merchantModel.findOneAndUpdate(
        { userId },
        { $set: allowedUpdates },
        { new: true, runValidators: true },
      );

      if (!updatedMerchant) {
        throw new NotFoundException('Merchant not found');
      }

      if (normalizedNewEmail) {
        await this.userModel.findByIdAndUpdate(
          userId,
          {
            $set: {
              email: normalizedNewEmail,
              isEmailVerified: true,
              updatedAt: new Date(),
            },
          },
        ).exec();
      }

      return {
        success: true,
        message: 'Merchant profile updated successfully',
        data: updatedMerchant,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to update merchant profile: ${error.message}`,
      );
    }
  }

  async updateNotificationSettings(
    userId: string,
    settings: {
      emailNotifications?: boolean;
      orderNotifications?: boolean;
      promotionNotifications?: boolean;
      pushNotifications?: boolean;
    },
  ) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const allowedSettings: Record<string, boolean> = {};
    const settingKeys = [
      'emailNotifications',
      'orderNotifications',
      'promotionNotifications',
      'pushNotifications',
    ] as const;

    for (const key of settingKeys) {
      if (settings?.[key] !== undefined) {
        if (typeof settings[key] !== 'boolean') {
          throw new BadRequestException(`${key} must be a boolean`);
        }
        allowedSettings[`notificationSettings.${key}`] = settings[key];
      }
    }

    if (Object.keys(allowedSettings).length === 0) {
      throw new BadRequestException(
        'At least one notification setting is required',
      );
    }

    try {
      const merchant = await this.merchantModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            ...allowedSettings,
            updatedAt: new Date(),
          },
        },
        { new: true, runValidators: true },
      );

      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }

      return {
        success: true,
        message: 'Notification settings updated successfully',
        data: merchant.notificationSettings,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to update notification settings: ${error.message}`,
      );
    }
  }

  /**
   * Delete merchant account and permanently wipe all store data
   */
  async deleteMerchantAccount(userId: string, dto: DeleteAccountDto) {
    if (dto.confirmation !== 'DELETE') {
      throw new BadRequestException('You must type DELETE to confirm account deletion.');
    }

    const userIdStr = String(userId);
    const merchant = await this.merchantModel.findOne({
      $or: [
        { userId: userIdStr },
        Types.ObjectId.isValid(userIdStr) ? { _id: new Types.ObjectId(userIdStr) } : undefined,
      ].filter(Boolean),
    }).exec();

    const merchantIdStr = merchant ? String(merchant._id) : '';
    const merchantUserId = merchant ? String(merchant.userId) : userIdStr;

    this.logger.warn(`Permanently deleting merchant account: ${userIdStr}. Store: ${merchant?.storeName || 'Unknown'}. Reason: ${dto.reason}. Details: ${dto.customReason || 'N/A'}`);

    // 0. Record in DeletedAccount collection for admin audit
    if (this.deletedAccountModel) {
      try {
        await this.deletedAccountModel.create({
          accountId: merchantIdStr || userIdStr,
          accountType: 'merchant',
          name: (merchant as any)?.ownerName || (merchant as any)?.name || 'Merchant',
          email: (merchant as any)?.storeEmail || (merchant as any)?.email || '',
          phone: (merchant as any)?.storePhone || (merchant as any)?.phone || '',
          storeName: merchant?.storeName || 'Merchant Store',
          storeCategory: merchant?.storeCategory || '',
          storeLocation: merchant?.storeLocation || '',
          reason: dto.reason || 'Not specified',
          customReason: dto.customReason || '',
          deletedBy: 'merchant',
          deletedAt: new Date(),
        });
      } catch (err) {
        this.logger.error(`Failed to record merchant deletion audit: ${err?.message}`);
      }
    }

    // Delete associated data
    await Promise.allSettled([
      // 1. Delete Merchant doc
      merchant ? this.merchantModel.deleteOne({ _id: merchant._id }).exec() : Promise.resolve(),
      // 2. Delete merchant User doc
      this.userModel.deleteMany({
        $or: [
          { _id: merchantUserId, accountType: 'merchant' },
          { _id: userIdStr, accountType: 'merchant' },
          { _id: userIdStr },
        ],
      }).exec(),
      // 3. Delete products
      this.connection?.collection('merchantproducts').deleteMany({
        $or: [
          { merchantId: merchantUserId },
          { merchantId: merchantIdStr },
          merchant ? { merchantId: merchant._id } : undefined,
        ].filter(Boolean),
      }),
      // 4. Delete offer promotions
      this.connection?.collection('offerpromotions').deleteMany({
        $or: [
          { merchantId: merchantUserId },
          { merchantId: merchantIdStr },
          merchant ? { merchantId: merchant._id } : undefined,
        ].filter(Boolean),
      }),
      // 5. Delete banner promotions
      this.connection?.collection('bannerpromotions').deleteMany({
        $or: [
          { merchantId: merchantUserId },
          { merchantId: merchantIdStr },
        ],
      }),
      // 6. Delete vouchers
      this.connection?.collection('vouchers').deleteMany({
        $or: [
          { merchantId: merchantUserId },
          { merchantId: merchantIdStr },
        ],
      }),
      // 7. Delete reviews
      this.connection?.collection('reviews').deleteMany({
        $or: [
          { merchantId: merchantUserId },
          { merchantId: merchantIdStr },
        ],
      }),
      // 8. Delete follows & views
      this.merchantDailyViewModel.deleteMany({
        merchantId: merchantIdStr || userIdStr,
      }).exec(),
      this.connection?.collection('follows').deleteMany({
        merchantId: merchantIdStr || userIdStr,
      }),
    ]);

    // Redis invalidation
    if (this.redisService) {
      try {
        await this.redisService.del(`merchant:${merchantIdStr}`);
        await this.redisService.del(`merchant:profile:${merchantUserId}`);
        await this.redisService.del(`merchant:stats:${merchantIdStr}`);
        await this.redisService.del(`merchant:reviews:${merchantIdStr}`);
      } catch (e) {
        // ignore
      }
    }

    return {
      success: true,
      message: 'Your merchant account and all store data have been permanently deleted.',
    };
  }
}

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { RedisService } from '../common/services/redis.service';
import { SecurityConfig } from '../security/config/security.config';
import * as crypto from 'crypto';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private client: ImageAnnotatorClient;

  constructor(private readonly redisService: RedisService) {
    // Initializes the client.
    try {
      if (process.env.GOOGLE_CREDENTIALS_JSON) {
        let envJson = process.env.GOOGLE_CREDENTIALS_JSON.trim();
        // Remove wrapping single or double quotes if present (common issue with Docker/PaaS env vars)
        if (
          (envJson.startsWith("'") && envJson.endsWith("'")) ||
          (envJson.startsWith('"') && envJson.endsWith('"'))
        ) {
          envJson = envJson.slice(1, -1);
        }
        const credentials = JSON.parse(envJson);

        // Ensure private_key has actual newlines, not literal '\n' strings which cause "DECODER routines::unsupported"
        if (credentials && credentials.private_key) {
          credentials.private_key = credentials.private_key.replace(
            /\\n/g,
            '\n',
          );
        }

        this.client = new ImageAnnotatorClient({ credentials });
      } else {
        this.client = new ImageAnnotatorClient();
      }
    } catch (error) {
      this.logger.error(
        'Failed to initialize Google Cloud Vision client. Please ensure GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS is set properly.',
        error.stack,
      );
    }
  }

  /**
   * Moderates an image using Google Cloud Vision SafeSearch.
   * Returns true if the image is safe, false if it contains inappropriate content.
   * @param imageUrl URL of the image to moderate.
   */
  async isImageSafe(imageUrl: string, merchantId?: string): Promise<boolean> {
    if (
      process.env.IMAGE_MODERATION === 'disable' ||
      process.env.IMAGE_MODERATION === 'mock-safe'
    ) {
      this.logger.log(
        `[BYPASS] Image moderation is disabled. Approving image automatically.`,
      );
      return true;
    }

    if (
      process.env.IMAGE_MODERATION === 'mock-unsafe' ||
      process.env.IMAGE_MODERATION === 'mock-reject'
    ) {
      this.logger.log(
        `[BYPASS] Image moderation mock-unsafe active. Rejecting image automatically.`,
      );
      return false;
    }

    // Development bypass
    if (process.env.MOCK_VISION_API === 'true') {
      this.logger.log(`[MOCK] Moderating image: ${imageUrl}`);
      // Simulate safe image. You can temporarily change this to 'return false'
      // if you want to test the rejection behavior in the UI.
      return true;
    }

    let imageHash = '';
    if (imageUrl) {
      imageHash = crypto.createHash('sha256').update(imageUrl).digest('hex');
      const cachedResult = await this.redisService.get<boolean>(
        `golo:moderation:cache:${imageHash}`,
      );
      if (cachedResult !== null && cachedResult !== undefined) {
        this.logger.log(
          `[CACHE HIT] Returning cached moderation result for image`,
        );
        return cachedResult;
      }
    }

    if (merchantId) {
      const today = new Date().toISOString().split('T')[0];
      const rateLimitKey = `golo:moderation:ratelimit:${merchantId}:${today}`;
      const currentUsage =
        (await this.redisService.get<number>(rateLimitKey)) || 0;

      if (currentUsage >= SecurityConfig.maxDailyModerationCalls) {
        throw new BadRequestException(
          `Daily image scan limit (${SecurityConfig.maxDailyModerationCalls}) exceeded to protect system resources. Please try again tomorrow.`,
        );
      }

      await this.redisService.set(rateLimitKey, currentUsage + 1, 86400); // 24 hours
    }

    if (!this.client) {
      this.logger.warn(
        'Google Cloud Vision client is not initialized. Skipping moderation (returning safe).',
      );
      return true;
    }

    try {
      this.logger.log(`Moderating image: ${imageUrl.substring(0, 50)}...`);

      let requestPayload: any = imageUrl;

      // If it's a base64 data URI, extract the base64 part and pass as Buffer
      if (imageUrl.startsWith('data:image/')) {
        const base64Data = imageUrl.split(',')[1];
        if (base64Data) {
          requestPayload = Buffer.from(base64Data, 'base64');
        }
      } else if (
        imageUrl.length > 200 &&
        !imageUrl.startsWith('http') &&
        !imageUrl.startsWith('gs://')
      ) {
        // If it's a very long string that doesn't start with http/gs, it's likely raw base64
        requestPayload = Buffer.from(imageUrl, 'base64');
      } else if (
        imageUrl.startsWith('http://') ||
        imageUrl.startsWith('https://')
      ) {
        // Download the image first to prevent Google Cloud Vision from being blocked by Cloudinary or CDN
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            requestPayload = Buffer.from(arrayBuffer);
          } else {
            this.logger.warn(
              `Failed to fetch image from URL: ${imageUrl}, status: ${response.status}`,
            );
          }
        } catch (fetchError) {
          this.logger.warn(
            `Error fetching image from URL: ${imageUrl} - ${fetchError.message}`,
          );
        }
      }

      const [result] = await this.client.safeSearchDetection(requestPayload);
      const detections = result.safeSearchAnnotation;

      if (!detections) {
        this.logger.warn(`No SafeSearch data returned for image: ${imageUrl}`);
        if (imageHash)
          await this.redisService.set(
            `golo:moderation:cache:${imageHash}`,
            true,
            7 * 24 * 3600,
          );
        return true; // If no detection data, assume safe
      }

      const blockedThresholds = ['LIKELY', 'VERY_LIKELY'];

      if (
        blockedThresholds.includes(detections.adult as string) ||
        blockedThresholds.includes(detections.violence as string) ||
        blockedThresholds.includes(detections.racy as string)
      ) {
        this.logger.warn(
          `Image ${imageUrl} rejected! Adult: ${detections.adult}, Violence: ${detections.violence}, Racy: ${detections.racy}`,
        );
        if (imageHash)
          await this.redisService.set(
            `golo:moderation:cache:${imageHash}`,
            false,
            7 * 24 * 3600,
          );

        await this.deleteFromCloudinary(imageUrl);
        return false;
      }

      this.logger.log(
        `Image ${imageUrl} approved! Adult: ${detections.adult}, Violence: ${detections.violence}, Racy: ${detections.racy}`,
      );
      if (imageHash)
        await this.redisService.set(
          `golo:moderation:cache:${imageHash}`,
          true,
          7 * 24 * 3600,
        );
      return true;
    } catch (error) {
      this.logger.error(
        `Error moderating image ${imageUrl.substring(0, 50)}...: ${error.message}`,
        error.stack,
      );
      try {
        require('fs').appendFileSync(
          'moderation_error.log',
          new Date().toISOString() + '\\n' + error.stack + '\\n\\n',
        );
      } catch (e) {}
      throw new BadRequestException(
        `Image moderation failed: ${error.message}`,
      );
    }
  }

  private async deleteFromCloudinary(imageUrl: string) {
    try {
      if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;

      // Extract public_id from Cloudinary URL
      const matches = imageUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
      if (matches && matches[1]) {
        const publicId = matches[1];
        this.logger.log(`Deleting rejected image from Cloudinary: ${publicId}`);
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete image from Cloudinary: ${error.message}`,
        error.stack,
      );
    }
  }
}

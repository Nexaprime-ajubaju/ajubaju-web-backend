import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private client: ImageAnnotatorClient;

  constructor() {
    // Initializes the client. 
    // It will automatically pick up GOOGLE_APPLICATION_CREDENTIALS from the environment.
    try {
      this.client = new ImageAnnotatorClient();
    } catch (error) {
      this.logger.error('Failed to initialize Google Cloud Vision client. Please ensure GOOGLE_APPLICATION_CREDENTIALS is set properly.', error.stack);
    }
  }

  /**
   * Moderates an image using Google Cloud Vision SafeSearch.
   * Returns true if the image is safe, false if it contains inappropriate content.
   * @param imageUrl URL of the image to moderate.
   */
  async isImageSafe(imageUrl: string): Promise<boolean> {
    // Development bypass
    if (process.env.MOCK_VISION_API === 'true') {
      this.logger.log(`[MOCK] Moderating image: ${imageUrl}`);
      // Simulate safe image. You can temporarily change this to 'return false' 
      // if you want to test the rejection behavior in the UI.
      return true;
    }

    if (!this.client) {
      this.logger.warn('Google Cloud Vision client is not initialized. Skipping moderation (returning safe).');
      return true;
    }

    try {
      this.logger.log(`Moderating image: ${imageUrl}`);
      
      const [result] = await this.client.safeSearchDetection(imageUrl);
      const detections = result.safeSearchAnnotation;
      
      if (!detections) {
        this.logger.warn(`No SafeSearch data returned for image: ${imageUrl}`);
        return true; // If no detection data, assume safe
      }

      const blockedThresholds = ['LIKELY', 'VERY_LIKELY'];

      if (
        blockedThresholds.includes(detections.adult as string) ||
        blockedThresholds.includes(detections.violence as string) ||
        blockedThresholds.includes(detections.racy as string)
      ) {
        this.logger.warn(
          `Image ${imageUrl} rejected! Adult: ${detections.adult}, Violence: ${detections.violence}, Racy: ${detections.racy}`
        );
        return false;
      }

      this.logger.log(`Image ${imageUrl} approved! Adult: ${detections.adult}, Violence: ${detections.violence}, Racy: ${detections.racy}`);
      return true;

    } catch (error) {
      this.logger.error(`Error moderating image ${imageUrl}: ${error.message}`, error.stack);
      // If the API call fails, we assume it's unsafe to prevent malicious uploads bypassing the check, 
      // but you could also choose to return true if you don't want to block users when Google API is down.
      // For strict moderation, return false.
      throw new BadRequestException('Image moderation failed. Please try a different image or try again later.');
    }
  }
}

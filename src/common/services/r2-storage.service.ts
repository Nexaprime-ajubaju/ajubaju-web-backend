import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private s3Client: S3Client | null = null;
  private accountId: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    this.accountId = (process.env.CLOUDFLARE_R2_ACCOUNT_ID || '').trim();
    this.accessKeyId = (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim();
    this.secretAccessKey = (
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || ''
    ).trim();
    this.bucketName = (
      process.env.CLOUDFLARE_R2_BUCKET_NAME || 'ajubaju-29-10'
    ).trim();
    this.publicUrl = (
      process.env.CLOUDFLARE_R2_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');

    if (this.isConfigured()) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
      this.logger.log(
        `Cloudflare R2 Storage initialized for bucket: ${this.bucketName}`,
      );
    } else {
      this.logger.warn(
        'Cloudflare R2 credentials are incomplete. R2 storage disabled.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(
      this.accountId &&
        this.accessKeyId &&
        this.secretAccessKey &&
        this.bucketName,
    );
  }

  getPublicUrl(key: string): string {
    const cleanKey = (key || '').replace(/^\/+/, '');
    if (this.publicUrl) {
      return `${this.publicUrl}/${cleanKey}`;
    }
    // Stream through Next.js proxy route
    return `/api/media/file/${cleanKey}`;
  }

  async uploadBuffer({
    buffer,
    key,
    contentType = 'application/octet-stream',
    metadata = {},
  }: {
    buffer: Buffer;
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ url: string; secure_url: string; key: string; bucket: string }> {
    if (!this.s3Client) {
      throw new Error('Cloudflare R2 is not configured.');
    }

    const cleanKey = (key || '').replace(/^\/+/, '');
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
    });

    await this.s3Client.send(command);
    const url = this.getPublicUrl(cleanKey);

    return {
      url,
      secure_url: url,
      key: cleanKey,
      bucket: this.bucketName,
    };
  }

  async deleteObject(keyOrUrl: string): Promise<boolean> {
    if (!this.s3Client || !keyOrUrl) return false;

    let key = keyOrUrl;
    if (key.includes('/api/media/file/')) {
      key = key.split('/api/media/file/')[1];
    } else if (key.includes('.r2.dev/')) {
      key = key.split('.r2.dev/')[1];
    } else if (key.includes('.cloudflarestorage.com/')) {
      const parts = key.split('.cloudflarestorage.com/')[1];
      key = parts ? parts.replace(/^[^/]+\//, '') : key;
    } else if (this.publicUrl && key.startsWith(this.publicUrl)) {
      key = key.replace(this.publicUrl, '').replace(/^\/+/, '');
    }

    const cleanKey = key.split('?')[0].replace(/^\/+/, '');

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: cleanKey,
      });
      await this.s3Client.send(command);
      this.logger.log(`Deleted object from Cloudflare R2: ${cleanKey}`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to delete object from R2 (${cleanKey}): ${err?.message}`);
      return false;
    }
  }
}

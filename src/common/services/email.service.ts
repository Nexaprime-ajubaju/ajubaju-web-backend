import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: any;
  private enabled: boolean;

  constructor(private configService: ConfigService) {
    this.enabled = !!this.configService.get('EMAIL_USER');

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get('EMAIL_HOST'),
        port: this.configService.get('EMAIL_PORT'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: this.configService.get('EMAIL_USER'),
          pass: this.configService.get('EMAIL_PASSWORD'),
        },
      });

      // Verify connection
      this.transporter.verify((error: any, success: any) => {
        if (error) {
          this.logger.error(
            `Email service verification failed: ${error.message}`,
          );
          this.enabled = false;
        } else {
          this.logger.log('Email service ready and connected');
        }
      });
    } else {
      this.logger.warn(
        'Email service not configured - emails will be logged only',
      );
    }
  }

  /**
   * Send email to admin when ad is reported
   */
  async sendReportNotification(data: {
    adId: string;
    adTitle: string;
    reason: string;
    description?: string;
    reportedBy: string;
    reportCount: number;
  }): Promise<boolean> {
    const adminEmail = this.configService.get('ADMIN_EMAIL');

    if (!adminEmail) {
      this.logger.error('ADMIN_EMAIL not configured');
      return false;
    }

    const mailOptions = {
      from: this.configService.get('EMAIL_FROM'),
      to: adminEmail,
      subject: `🚨 Ad Reported: ${data.reason.toUpperCase()} (${data.reportCount} total reports)`,
      html: this.generateReportEmailHTML(data),
    };

    try {
      if (!this.enabled || !this.transporter) {
        this.logger.warn(
          `[EMAIL MOCK] Would send to ${adminEmail}: Report for ad ${data.adId}`,
        );
        this.logger.log(JSON.stringify(data, null, 2));
        return false;
      }

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Email sent to admin: ${info.messageId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send email: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate HTML email for ad report
   */
  private generateReportEmailHTML(data: {
    adId: string;
    adTitle: string;
    reason: string;
    description?: string;
    reportedBy: string;
    reportCount: number;
  }): string {
    const urgencyColor =
      data.reportCount >= 10
        ? '#dc2626'
        : data.reportCount >= 5
          ? '#ea580c'
          : '#ca8a04';
    const urgencyText =
      data.reportCount >= 10
        ? 'CRITICAL - Auto-Disabled'
        : data.reportCount >= 5
          ? 'High Priority'
          : 'New Report';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .urgency-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; color: white; font-weight: bold; font-size: 12px; }
            .report-count { font-size: 32px; font-weight: bold; color: ${urgencyColor}; margin: 20px 0; }
            .detail-row { margin: 15px 0; padding: 15px; background: white; border-left: 4px solid ${urgencyColor}; border-radius: 5px; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            .value { margin-top: 5px; color: #1f2937; }
            .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Ad Reported for Review</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">GOLO Content Moderation System</p>
            </div>
            
            <div class="content">
              <div style="text-align: center;">
                <span class="urgency-badge" style="background: ${urgencyColor};">${urgencyText}</span>
                <div class="report-count">${data.reportCount} Report${data.reportCount !== 1 ? 's' : ''}</div>
              </div>

              <div class="detail-row">
                <div class="label">Ad Title</div>
                <div class="value"><strong>${data.adTitle}</strong></div>
                <div class="label" style="margin-top: 10px;">Ad ID</div>
                <div class="value"><code>${data.adId}</code></div>
              </div>

              <div class="detail-row">
                <div class="label">Report Reason</div>
                <div class="value" style="font-size: 18px; color: ${urgencyColor};">
                  ${this.getReasonEmoji(data.reason)} ${this.formatReason(data.reason)}
                </div>
              </div>

              ${
                data.description
                  ? `
                <div class="detail-row">
                  <div class="label">Reporter's Description</div>
                  <div class="value" style="font-style: italic;">"${data.description}"</div>
                </div>
              `
                  : ''
              }

              <div class="detail-row">
                <div class="label">Reported By (User ID)</div>
                <div class="value"><code>${data.reportedBy}</code></div>
              </div>

              <div style="text-align: center;">
                <a href="https://golo-frontend.vercel.app/admin/reports" class="button">
                  Review This Ad →
                </a>
              </div>

              ${
                data.reportCount >= 10
                  ? `
                <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px;">
                  <strong style="color: #dc2626;">⚠️ AUTO-DISABLED</strong>
                  <p style="margin: 10px 0 0 0; color: #991b1b; font-size: 14px;">
                    This ad has been automatically disabled due to reaching 10 reports. Please review immediately.
                  </p>
                </div>
              `
                  : ''
              }

              <div class="footer">
                <p>This is an automated notification from GOLO's content moderation system.</p>
                <p style="margin-top: 10px;">
                  If you believe this is an error, please contact the technical team.
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getReasonEmoji(reason: string): string {
    const emojis: Record<string, string> = {
      spam: '📢',
      inappropriate: '⚠️',
      fraud: '🚫',
      duplicate: '📋',
      other: '📝',
    };
    return emojis[reason] || '📝';
  }

  private formatReason(reason: string): string {
    return reason.charAt(0).toUpperCase() + reason.slice(1);
  }
}

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

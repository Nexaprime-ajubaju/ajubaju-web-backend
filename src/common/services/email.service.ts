import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: any;
  private enabled: boolean;

  constructor(private configService: ConfigService) {
    const user = this.configService.get('EMAIL_USER') || this.configService.get('SMTP_USER');
    const host = this.configService.get('EMAIL_HOST') || this.configService.get('SMTP_HOST');
    const port = this.configService.get('EMAIL_PORT') || this.configService.get('SMTP_PORT');
    const pass = this.configService.get('EMAIL_PASSWORD') || this.configService.get('SMTP_PASS');

    this.enabled = !!user;
    
    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: port == 465, // true for 465, false for other ports
        auth: {
          user: user,
          pass: pass,
        },
      });

      // Verify connection
      this.transporter.verify((error: any, success: any) => {
        if (error) {
          this.logger.error(`Email service verification failed: ${error.message}`);
          this.enabled = false;
        } else {
          this.logger.log('Email service ready and connected');
        }
      });
    } else {
      this.logger.warn('Email service not configured - emails will be logged only');
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
      from: this.configService.get('EMAIL_FROM') || this.configService.get('SMTP_FROM'),
      to: adminEmail,
      subject: `🚨 Ad Reported: ${data.reason.toUpperCase()} (${data.reportCount} total reports)`,
      html: this.generateReportEmailHTML(data),
    };

    try {
      if (!this.enabled || !this.transporter) {
        this.logger.warn(`[EMAIL MOCK] Would send to ${adminEmail}: Report for ad ${data.adId}`);
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
    const urgencyColor = data.reportCount >= 10 ? '#dc2626' : data.reportCount >= 5 ? '#ea580c' : '#ca8a04';
    const urgencyText = data.reportCount >= 10 ? 'CRITICAL - Auto-Disabled' : data.reportCount >= 5 ? 'High Priority' : 'New Report';

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

              ${data.description ? `
                <div class="detail-row">
                  <div class="label">Reporter's Description</div>
                  <div class="value" style="font-style: italic;">"${data.description}"</div>
                </div>
              ` : ''}

              <div class="detail-row">
                <div class="label">Reported By (User ID)</div>
                <div class="value"><code>${data.reportedBy}</code></div>
              </div>

              <div style="text-align: center;">
                <a href="https://golo-frontend.vercel.app/admin/reports" class="button">
                  Review This Ad →
                </a>
              </div>

              ${data.reportCount >= 10 ? `
                <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px;">
                  <strong style="color: #dc2626;">⚠️ AUTO-DISABLED</strong>
                  <p style="margin: 10px 0 0 0; color: #991b1b; font-size: 14px;">
                    This ad has been automatically disabled due to reaching 10 reports. Please review immediately.
                  </p>
                </div>
              ` : ''}

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

  async sendMerchantWelcomeEmail(email: string, storeName: string): Promise<boolean> {
    const mailOptions = {
      from: `"GOLO No-Reply" <${this.configService.get('EMAIL_FROM') || this.configService.get('SMTP_FROM') || this.configService.get('EMAIL_USER')}>`,
      replyTo: 'noreply@golo.com',
      to: email,
      subject: `Welcome to GOLO! Your Merchant Registration is Under Review`,
      text: `Hello ${storeName},\n\nThank you for registering on GOLO! We have received your merchant application and business documents.\n\nOur compliance team will review your details. This process usually takes around 24-48 hours. We will notify you via email once your account has been approved or if we need any further information.\n\nBest regards,\nThe GOLO Team`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #157A4F; border-bottom: 2px solid #157A4F; padding-bottom: 10px;">Registration Received</h2>
          <p>Hello ${storeName},</p>
          <p>Thank you for registering on GOLO! We have received your merchant application and business documents.</p>
          <p>Our compliance team will review your details. This process usually takes around 24-48 hours. We will notify you via email once your account has been approved or if we need any further information.</p>
          <br>
          <p>Best regards,<br><strong>The GOLO Team</strong></p>
        </div>
      `,
    };

    try {
      if (!this.enabled || !this.transporter) return false;
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Welcome email sent to merchant: ${email}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send merchant welcome email: ${error.message}`);
      return false;
    }
  }

  async sendMerchantApprovalEmail(email: string, storeName: string): Promise<boolean> {
    const loginLink = this.configService.get('MERCHANT_LOGIN_URL') || 'http://localhost:3001/merchant-login';
    const mailOptions = {
      from: `"GOLO No-Reply" <${this.configService.get('EMAIL_FROM') || this.configService.get('SMTP_FROM') || this.configService.get('EMAIL_USER')}>`,
      replyTo: 'noreply@golo.com',
      to: email,
      subject: `Congratulations! Your GOLO Merchant Account is Approved`,
      text: `Hello ${storeName},\n\nGreat news! Your merchant application has been approved by our compliance team.\n\nYou are now an active merchant on GOLO. You can log in to your dashboard to start setting up your store, managing your inventory, and reaching new customers.\n\nLog In to Dashboard: ${loginLink}\n\nWelcome aboard!\n\nBest regards,\nThe GOLO Team`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #157A4F; border-bottom: 2px solid #157A4F; padding-bottom: 10px;">Account Approved! 🎉</h2>
          <p>Hello ${storeName},</p>
          <p>Great news! Your merchant application has been <strong>approved</strong> by our compliance team.</p>
          <p>You are now an active merchant on GOLO. You can log in to your dashboard to start setting up your store, managing your inventory, and reaching new customers.</p>
          <p><a href="${loginLink}" style="display: inline-block; padding: 10px 20px; background: #157A4F; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Log In to Dashboard</a></p>
          <p>Welcome aboard!</p>
          <br>
          <p>Best regards,<br><strong>The GOLO Team</strong></p>
        </div>
      `,
    };

    try {
      if (!this.enabled || !this.transporter) return false;
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Approval email sent to merchant: ${email}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send merchant approval email: ${error.message}`);
      return false;
    }
  }

  async sendMerchantDeclineEmail(email: string, storeName: string, reason: string): Promise<boolean> {
    const registerLink = this.configService.get('MERCHANT_REGISTER_URL') || 'http://localhost:3001/merchant-register';
    const mailOptions = {
      from: `"GOLO No-Reply" <${this.configService.get('EMAIL_FROM') || this.configService.get('SMTP_FROM') || this.configService.get('EMAIL_USER')}>`,
      replyTo: 'noreply@golo.com',
      to: email,
      subject: `Update on your GOLO Merchant Application`,
      text: `Hello ${storeName},\n\nThank you for your interest in becoming a merchant on GOLO. After careful review, we are currently unable to approve your application.\n\nReason for decline:\n${reason}\n\nPlease review the provided feedback and ensure all documents and details meet our compliance requirements. You are welcome to re-apply once these issues are addressed.\n\nRe-apply on GOLO: ${registerLink}\n\nBest regards,\nThe GOLO Team`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">Application Update</h2>
          <p>Hello ${storeName},</p>
          <p>Thank you for your interest in becoming a merchant on GOLO. After careful review, we are currently unable to approve your application.</p>
          <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0;"><strong>Reason for decline:</strong><br>${reason}</p>
          </div>
          <p>Please review the provided feedback and ensure all documents and details meet our compliance requirements. You are welcome to re-apply once these issues are addressed.</p>
          <p><a href="${registerLink}" style="display: inline-block; padding: 10px 20px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Re-apply on GOLO</a></p>
          <br>
          <p>Best regards,<br><strong>The GOLO Team</strong></p>
        </div>
      `,
    };

    try {
      if (!this.enabled || !this.transporter) return false;
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Decline email sent to merchant: ${email}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send merchant decline email: ${error.message}`);
      return false;
    }
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

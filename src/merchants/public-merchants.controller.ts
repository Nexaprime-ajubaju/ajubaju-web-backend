import { Controller, Get, Post, Body, Param, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import * as nodemailer from 'nodemailer';

@Controller('merchant')
export class PublicMerchantsController {
  private readonly logger = new Logger(PublicMerchantsController.name);

  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('public/:merchantId/profile')
  async getPublicMerchantProfile(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getPublicMerchantProfile(merchantId);
  }

  @Get('public/:merchantId/store-location')
  async getPublicMerchantStoreLocation(
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantsService.getPublicMerchantStoreLocation(merchantId);
  }

  /**
   * POST /merchant/send-registration-invite
   * Public endpoint — sends a welcome email to a prospective merchant
   * with a link to complete their registration on GOLO.
   */
  @Post('send-registration-invite')
  async sendRegistrationInvite(@Body() body: { email: string }) {
    const email = (body?.email || '').trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('Email address is required.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Please provide a valid email address.');
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || `GOLO <${smtpUser}>`;

    if (!smtpUser || !smtpPass) {
      this.logger.error('SMTP credentials (SMTP_USER / SMTP_PASS) are not configured in .env');
      throw new InternalServerErrorException('Email service is not configured. Please contact support.');
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
    const registrationLink = `${frontendBaseUrl}/merchant-register`;
    const merchantPageLink = `${frontendBaseUrl}/merchant`;


    const htmlBody = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to GOLO Network</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#157a4f 0%,#1aaa6b 100%);padding:40px 48px;text-align:center;">
                    <div style="display:inline-block;background:#f3b12a;border-radius:12px;padding:8px 20px;margin-bottom:20px;">
                      <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:2px;">GOLO</span>
                    </div>
                    <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 8px 0;line-height:1.2;">
                      Welcome to GOLO Network! 🎉
                    </h1>
                    <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;">
                      Your journey to growing your local business starts here.
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:44px 48px;">
                    <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 20px 0;">
                      Hi there 👋,
                    </p>
                    <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 20px 0;">
                      Thank you for your interest in joining the <strong style="color:#157a4f;">GOLO Merchant Network</strong>! We're excited to help you connect with thousands of local customers, manage your offers, and grow your business — all from one powerful platform.
                    </p>
                    <p style="color:#374151;font-size:16px;line-height:1.7;margin:0 0 32px 0;">
                      You're just one step away. Click the button below to complete your merchant registration and unlock <strong>50 days of premium features — completely free</strong>:
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:0 0 36px 0;">
                          <a href="${registrationLink}"
                            style="display:inline-block;background:linear-gradient(135deg,#f3b12a,#e0a020);color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;padding:16px 44px;border-radius:50px;box-shadow:0 4px 16px rgba(243,177,42,0.4);letter-spacing:0.5px;">
                            Complete Your Registration →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- What you get -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf5;border-radius:12px;padding:28px 28px 20px 28px;margin-bottom:32px;">
                      <tr>
                        <td>
                          <p style="color:#0f5c3d;font-size:14px;font-weight:700;margin:0 0 16px 0;text-transform:uppercase;letter-spacing:1px;">
                            ✅ What's included in your free trial
                          </p>
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#157a4f;font-size:14px;padding:5px 0;">✓&nbsp;&nbsp;</td>
                              <td style="color:#374151;font-size:14px;padding:5px 0;">Full access to the merchant dashboard</td>
                            </tr>
                            <tr>
                              <td style="color:#157a4f;font-size:14px;padding:5px 0;">✓&nbsp;&nbsp;</td>
                              <td style="color:#374151;font-size:14px;padding:5px 0;">Unlimited product & offer listings</td>
                            </tr>
                            <tr>
                              <td style="color:#157a4f;font-size:14px;padding:5px 0;">✓&nbsp;&nbsp;</td>
                              <td style="color:#374151;font-size:14px;padding:5px 0;">City-wide customer reach & real-time analytics</td>
                            </tr>
                            <tr>
                              <td style="color:#157a4f;font-size:14px;padding:5px 0;">✓&nbsp;&nbsp;</td>
                              <td style="color:#374151;font-size:14px;padding:5px 0;">Banner & promotional ad placements</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px 0;">
                      If you did not request this email, you can safely ignore it.
                    </p>
                    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
                      Questions? Reply to this email or visit our
                      <a href="${merchantPageLink}" style="color:#157a4f;text-decoration:none;font-weight:600;">merchant page</a>.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:28px 48px;text-align:center;">
                    <p style="color:#9ca3af;font-size:12px;margin:0 0 8px 0;">
                      © 2026 GOLO Inc. · All rights reserved.
                    </p>
                    <p style="color:#9ca3af;font-size:12px;margin:0;">
                      GOLO Merchant Network · Growing Local Businesses Everywhere
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      await transporter.sendMail({
        from: `"GOLO No-Reply" <${smtpUser}>`,
        replyTo: 'noreply@golo.com',
        to: email,
        subject: '🎉 Welcome to GOLO – Complete Your Merchant Registration',
        html: htmlBody,
      });

      this.logger.log(`✅ Merchant invite sent to: ${email}`);

      return {
        success: true,
        message: 'Registration invite sent successfully. Please check your inbox.',
      };
    } catch (error: any) {
      this.logger.error(`Failed to send invite email to ${email}: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to send the registration email. Please try again later.',
      );
    }
  }
}

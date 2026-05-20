import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { AnalyticsModule } from './analytics/analytics.module';
import { KafkaModule } from './kafka/kafka.module';
import { AdsModule } from './ads/ads.module';
import { UsersModule } from './users/users.module';
import { PaymentsModule } from './payments/payments.module';
import { ChatsModule } from './chats/chats.module';
import { CallsModule } from './calls/calls.module';
import { ReportsModule } from './reports/reports.module';
import { RedisModule } from './common/services/redis.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { MerchantProductsModule } from './merchant-products/merchant-products.module';
import { MerchantDashboardModule } from './merchant-dashboard/merchant-dashboard.module';
import { BannersModule } from './banners/banners.module';
import { OffersModule } from './offers/offers.module';
import { MerchantsModule } from './merchants/merchants.module';
import { OrdersModule } from './orders/orders.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

const logger = new Logger('MongoDB');

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // MongoDB Connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Get URI from config
        let uri = configService.get<string>('config.mongodb.uri');
        
        // Fallback to environment variable if config doesn't have it
        if (!uri) {
          logger.warn('MongoDB URI not found in config, checking environment variable...');
          uri = process.env.MONGODB_URI;
        }
        
        // Final fallback with encoded password
       // Final fallback with EXTERNAL IP
       if (!uri) {
            logger.warn('Using hardcoded MongoDB URI with external IP');
            uri = 'mongodb://mongo:nexaprime123@62.72.23.96:27017/?authSource=admin&directConnection=true';
          }
        
        // Log sanitized URI
        const sanitizedUri = uri.replace(/\/\/.*@/, '//<credentials>@');
        logger.log(`Attempting MongoDB connection to: ${sanitizedUri}`);
        
        return {
          uri,
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
          retryWrites: true,
          retryReads: true,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              logger.log('✅ MongoDB connected successfully');
            });
            connection.on('error', (error) => {
              logger.error(`❌ MongoDB connection error: ${error.message}`);
            });
            connection.on('disconnected', () => {
              logger.warn('⚠️ MongoDB disconnected');
            });
            connection.on('reconnected', () => {
              logger.log('🔄 MongoDB reconnected');
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),

    // Feature Modules
    RedisModule,
    KafkaModule,
    AdsModule,
    UsersModule,
    MerchantsModule,
    PaymentsModule,
    ChatsModule,
    CallsModule,
    ReportsModule,
    AuditLogsModule,
    AnalyticsModule,
    MerchantProductsModule,
    MerchantDashboardModule,
    BannersModule,
    OffersModule,
    OrdersModule,
    VouchersModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

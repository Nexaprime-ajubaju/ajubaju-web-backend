import { Logger, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { OutboxModule } from './outbox/outbox.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { MerchantPlanModule } from './merchant-plan/merchant-plan.module';
import { HomepageConfigModule } from './homepage-config/homepage-config.module';
import { RecommendationEngineModule } from './recommendation-engine/recommendation-engine.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { LoggerModule } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

import { FeatureStoreModule } from './feature-store/feature-store.module';

const logger = new Logger('MongoDB');

@Module({
  imports: [
    // Configuration - load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3005),
        MONGODB_URI: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        TRUST_PROXY: Joi.boolean().default(false),
      }),
      validationOptions: {
        abortEarly: true,
      },
    }),

    // Structured Logging
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) => req.headers['x-request-id'] || uuidv4(),
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),

    // Async Events and Scheduling
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    // Rate Limiting Config
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
      {
        name: 'public',
        ttl: 60000,
        limit: 30,
      },
      {
        name: 'admin',
        ttl: 60000,
        limit: 60,
      },
      {
        name: 'upload',
        ttl: 60000,
        limit: 20,
      },
    ]),

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
        
        // Final fallback to localhost
        if (!uri) {
            logger.warn('Using fallback MongoDB URI to localhost');
            uri = 'mongodb://localhost:27017/golo';
        }
        
        // Log sanitized URI
        const sanitizedUri = uri.replace(/\/\/.*@/, '//<credentials>@');
        logger.log(`Attempting MongoDB connection to: ${sanitizedUri}`);
        return {
          uri: uri,
          family: 4,
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              logger.log('MongoDB connected successfully');
            });
            connection.on('error', (error) => {
              logger.error(`MongoDB connection error: ${error.message}`);
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),

    // Feature Modules - order doesn't matter with forwardRef
    RedisModule, // Global Redis caching
    KafkaModule,
    OutboxModule,
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
    SystemSettingsModule,
    MerchantPlanModule,
    HomepageConfigModule,
    FeatureStoreModule,
    RecommendationEngineModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }

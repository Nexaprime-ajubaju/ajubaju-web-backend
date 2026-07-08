import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as compression from 'compression';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import * as hpp from 'hpp';
import * as mongoSanitize from 'express-mongo-sanitize';
import * as cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

dotenv.config();

const vercelOriginPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const parseBoolean = (value?: string): boolean => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const isAllowedOrigin = (origin: string, allowedOrigins: string[]): boolean => {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return vercelOriginPattern.test(origin);
};

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
});

async function bootstrap() {
  console.log('--> BOOTSTRAP STARTING');
  const kafkaEnabled = parseBoolean(process.env.ENABLE_KAFKA);

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);

  const httpAdapter = app.getHttpAdapter();
  if (process.env.TRUST_PROXY === 'true') {
    httpAdapter.getInstance().set('trust proxy', 1);
    logger.log('Trust Proxy enabled');
  }

  // Security Headers & Middlewares
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(hpp());
  app.use(mongoSanitize());
  app.use(cookieParser());
  httpAdapter.getInstance().disable('x-powered-by');

  // Performance
  app.use(compression());

  // Allow larger payloads for banner image submissions (base64 data URLs).
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  app.useGlobalPipes(validationPipe);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  if (kafkaEnabled) {
    const brokers = (process.env.KAFKA_BROKERS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      throw new Error(
        'ENABLE_KAFKA=true but KAFKA_BROKERS is empty. Set KAFKA_BROKERS in .env.',
      );
    }

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: process.env.KAFKA_CLIENT_ID || 'golo-backend',
          brokers,
        },
        consumer: {
          groupId: process.env.KAFKA_GROUP_ID || 'golo-consumer-group',
        },
        producer: {
          allowAutoTopicCreation: true,
        },
      },
    });

    await app.startAllMicroservices();
    logger.log(`Kafka mode enabled. Brokers: ${brokers.join(', ')}`);
  }

  const corsOrigins = configService.get<string[]>('config.cors.origins') || [];

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser requests can have no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins =
        corsOrigins.length > 0
          ? corsOrigins
          : [
              'http://localhost:3000',
              'http://localhost:3001',
              'http://localhost:3004',
            ];

      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = configService.get('config.service.port');

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('GOLO API')
      .setDescription('The complete GOLO backend API documentation.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
  }

  console.log('--> ABOUT TO LISTEN ON PORT', port);
  await app.listen(port, '0.0.0.0');
  console.log('--> LISTENING ON PORT', port);
}
bootstrap().catch((err) => console.error('--> BOOTSTRAP FAILED', err));

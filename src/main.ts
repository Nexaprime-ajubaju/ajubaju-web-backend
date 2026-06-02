import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { json, urlencoded } from 'express';

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
  const logger = new Logger('Bootstrap');
  const kafkaEnabled = parseBoolean(process.env.ENABLE_KAFKA);

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Allow larger payloads for banner image submissions (base64 data URLs).
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  app.useGlobalPipes(validationPipe);

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

      const allowedOrigins = corsOrigins.length > 0
        ? corsOrigins
        : ['http://localhost:3000', 'http://localhost:3001'];

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
  await app.listen(port, '0.0.0.0');
  logger.log(`HTTP mode enabled. Ads microservice is running on port ${port}`);
}
bootstrap();

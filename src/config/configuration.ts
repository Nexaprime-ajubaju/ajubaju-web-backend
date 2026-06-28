import { registerAs } from '@nestjs/config';

const parseBoolean = (value?: string): boolean => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseList = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export default registerAs('config', () => ({
  environment: process.env.NODE_ENV || 'development',
  
  service: {
    name: process.env.SERVICE_NAME || 'ads-service',
    port: Number.parseInt(process.env.PORT, 10) || 3002,
  },
  
  cors: {
    origins: parseList(process.env.CORS_ORIGINS),
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/golo',
    host: process.env.MONGODB_HOST || 'localhost',
    port: parseInt(process.env.MONGODB_PORT || '27017', 10),
    username: process.env.MONGODB_USERNAME || '',
    password: process.env.MONGODB_PASSWORD || '',
    database: process.env.MONGODB_DATABASE || 'golo',
},
  
  kafka: {
    enabled: parseBoolean(process.env.ENABLE_KAFKA ?? 'false'),
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : [],
    clientId: process.env.KAFKA_CLIENT_ID || 'golo-backend',
    groupId: process.env.KAFKA_GROUP_ID || 'golo-consumer-group',
    sasl: process.env.KAFKA_SASL_USERNAME
      ? {
          mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
          username: process.env.KAFKA_SASL_USERNAME,
          password: process.env.KAFKA_SASL_PASSWORD,
        }
      : undefined,
    ssl: false,
  },

  redis: {
    enabled: parseBoolean(process.env.ENABLE_REDIS ?? 'false'),
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'golo:',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '20m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'razorpay',
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    },
  },
}));

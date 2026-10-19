import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { validateEnvironment } from './config/env.validation.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // 1. Strict Environment Validation
  const config = validateEnvironment(process.env);
  logger.log(`Starting ${config.serviceName} v${config.serviceVersion} [${config.nodeEnv}]`);

  // 2. Nest Application Factory
  const app = await NestFactory.create(AppModule, {
    logger: config.nodeEnv === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // 3. Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // 4. Request Body Size Limits
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));

  // 5. Restricted CORS Policy
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin) || config.nodeEnv === 'development') {
        return callback(null, true);
      }
      return callback(new Error(`CORS error: Origin ${origin} not permitted.`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // 6. Global API Route Prefix
  app.setGlobalPrefix(config.apiPrefix);

  // 7. Global Filters & Interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // 8. Start Listening
  await app.listen(config.port, '0.0.0.0');
  logger.log(`VERTEX API engine listening on port ${config.port} with prefix /${config.apiPrefix}`);
}

// Only execute bootstrap directly if not running within a test suite
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('Fatal startup error in VERTEX API bootstrap:', err);
    process.exit(1);
  });
}

export { bootstrap };

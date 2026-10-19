import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { validateDatabaseConfig, DatabaseConfig } from './config/database.config.js';

export interface DatabaseReadinessResult {
  status: 'up' | 'down';
  service: string;
  latencyMs?: number;
  message?: string;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly config: DatabaseConfig;

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    const config = validateDatabaseConfig(rawUrl);

    super({
      datasources: config.isConfigured
        ? {
            db: {
              url: config.databaseUrl,
            },
          }
        : undefined,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    this.config = config;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.isConfigured) {
      this.logger.warn('DATABASE_URL is not configured. Database connection is deferred.');
      return;
    }

    try {
      this.logger.log(`Initializing database connection to ${this.config.maskedHost}...`);
      await this.$connect();
      this.logger.log(`Database connection established successfully to ${this.config.maskedHost}.`);
    } catch (error) {
      // Never log full connection string with credentials
      const sanitizedMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Database connection failed to ${this.config.maskedHost}: ${sanitizedMessage}`);
      // In development or if explicitly allowed, do not crash the app immediately on startup
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Database initialization failed in production environment.');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting database client cleanly...');
    await this.$disconnect();
    this.logger.log('Database client disconnected.');
  }

  /**
   * Health Readiness Check
   * Performs a lightweight query (`SELECT 1`) to verify connectivity.
   * Never exposes credentials or internal errors publicly.
   */
  async checkReadiness(): Promise<DatabaseReadinessResult> {
    if (!this.config.isConfigured) {
      return {
        status: 'down',
        service: 'postgresql',
        message: 'Database is unconfigured.',
      };
    }

    const start = Date.now();
    try {
      await this.$queryRawUnsafe('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        status: 'up',
        service: 'postgresql',
        latencyMs,
      };
    } catch {
      return {
        status: 'down',
        service: 'postgresql',
        message: 'Database connection unreachable.',
      };
    }
  }
}

import { Injectable, Inject } from '@nestjs/common';
import type { HealthResponse, ReadyResponse } from '@vertex/contracts';
import { PrismaService } from '@vertex/database';
import { APP_SERVICE_NAME, APP_VERSION } from '../config/env.config.js';

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: APP_SERVICE_NAME,
      version: APP_VERSION,
    };
  }

  async getReadiness(): Promise<ReadyResponse> {
    const dbStatus = await this.prisma.checkReadiness();
    const isDegraded = dbStatus.status !== 'up';

    return {
      status: isDegraded ? 'degraded' : 'ok',
      service: APP_SERVICE_NAME,
      version: APP_VERSION,
      database: {
        status: dbStatus.status,
        service: dbStatus.service,
        message: dbStatus.message,
      },
    };
  }
}

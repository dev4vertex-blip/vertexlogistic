import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@vertex/contracts';
import { APP_SERVICE_NAME, APP_VERSION } from '../config/env.config.js';

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: APP_SERVICE_NAME,
      version: APP_VERSION,
    };
  }
}

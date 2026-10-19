import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import type { HealthResponse, ReadyResponse } from '@vertex/contracts';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  check(): HealthResponse {
    return this.healthService.getHealth();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<ReadyResponse> {
    return this.healthService.getReadiness();
  }
}

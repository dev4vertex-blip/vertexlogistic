import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import type { HealthResponse } from '@vertex/contracts';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  check(): HealthResponse {
    return this.healthService.getHealth();
  }
}

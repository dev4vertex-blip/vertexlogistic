import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TenantGuard } from './guards/tenant.guard.js';
import { Roles, RequireTenant } from './decorators/auth.decorators.js';
import type { LoginResponse } from '@vertex/contracts';

interface AuthenticatedRequest extends Request {
  user?: any;
  organizationId?: string;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown): Promise<LoginResponse> {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getProfile(@Req() req: AuthenticatedRequest) {
    return {
      user: req.user,
    };
  }

  // Demonstration and test endpoints for security verification
  @Get('test/protected')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  testProtected(@Req() req: AuthenticatedRequest) {
    return {
      message: 'Access granted to authenticated user.',
      userId: req.user?.sub,
    };
  }

  @Get('test/internal-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  testInternalOnly() {
    return {
      message: 'Access granted to internal administrator.',
    };
  }

  @Get('test/tenant-resource')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @RequireTenant()
  @HttpCode(HttpStatus.OK)
  testTenantResource(@Req() req: AuthenticatedRequest) {
    return {
      message: 'Access granted to tenant resource.',
      organizationId: req.organizationId,
    };
  }
}

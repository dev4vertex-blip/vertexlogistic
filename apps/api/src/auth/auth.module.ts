import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TenantGuard } from './guards/tenant.guard.js';
import { getAppConfig } from '../config/env.config.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [
    EmailModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const config = getAppConfig();
        return {
          secret: config.jwtSecret,
          signOptions: {
            expiresIn: config.jwtExpiresIn,
            issuer: config.jwtIssuer,
            audience: config.jwtAudience,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, TenantGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, TenantGuard, JwtModule],
})
export class AuthModule {}

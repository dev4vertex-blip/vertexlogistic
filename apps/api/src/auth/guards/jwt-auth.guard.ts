import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service.js';
import { getAppConfig } from '../../config/env.config.js';
import type { JwtPayload } from '@vertex/contracts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing authorization header.');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token || token.trim() === '') {
      throw new UnauthorizedException('Invalid authorization format. Must be "Bearer <token>".');
    }

    const config = getAppConfig();

    try {
      // Validate signature, issuer, audience, expiration, and permitted algorithms
      const payload: JwtPayload = await this.jwtService.verifyAsync(token, {
        secret: config.jwtSecret,
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        algorithms: ['HS256'],
      });

      // Reject non-ACTIVE users if token claims indicate inactive status
      if (payload.status && payload.status !== 'ACTIVE') {
        throw new UnauthorizedException(`Account is ${payload.status.toLowerCase()}. Authorization revoked.`);
      }

      // Check current user status against the database to prevent stale token reuse after account suspension
      const isCurrentlyActive = await this.authService.validateActiveUser(payload.sub);
      if (!isCurrentlyActive) {
        throw new UnauthorizedException('User account is suspended, deactivated, or no longer active.');
      }

      request.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service.js';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/auth.decorators.js';
import type { JwtPayload } from '@vertex/contracts';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles or permissions are required, allow authenticated user through
    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user || !user.sub) {
      throw new UnauthorizedException('Authentication required before evaluating roles.');
    }

    let userRoles;
    try {
      // Retrieve active roles and permissions for user
      userRoles = await this.authService.getUserRoles(user.sub);
    } catch (err) {
      this.logger.error(`Database failure during role lookup for user ID ${user.sub}: ${err}`);
      throw new ForbiddenException('Role verification failed. Denying access (fail-closed).');
    }

    if (!userRoles || userRoles.length === 0) {
      throw new ForbiddenException('Access denied: user has no active assigned roles.');
    }

    // 1. Check System Internal Role Scope Separation
    if (requiredRoles) {
      const systemRoles = ['SUPER_ADMIN', 'HUB_OPERATOR', 'BRANCH_MANAGER', 'FINANCE_ADMIN'];
      const requiresSystemRole = requiredRoles.some((r) => systemRoles.includes(r));

      if (requiresSystemRole && user.userType !== 'INTERNAL_EMPLOYEE') {
        throw new ForbiddenException('Cross-boundary violation: System internal roles are restricted to internal employees.');
      }
    }

    // 2. Check Permissions
    if (requiredPermissions && requiredPermissions.length > 0) {
      const allUserPermissions = userRoles.flatMap((r) => r.permissions);
      const hasAllPermissions = requiredPermissions.every((perm) => allUserPermissions.includes(perm));

      if (!hasAllPermissions) {
        throw new ForbiddenException('Access denied: missing required permissions.');
      }
    }

    return true;
  }
}

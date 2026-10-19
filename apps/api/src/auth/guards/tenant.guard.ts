import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service.js';
import { REQUIRE_TENANT_KEY } from '../decorators/auth.decorators.js';
import { evaluateTenantAccess } from '@vertex/database';
import { UserStatus } from '@prisma/client';
import type { JwtPayload } from '@vertex/contracts';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isTenantRequired = this.reflector.getAllAndOverride<boolean>(REQUIRE_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user || !user.sub) {
      throw new UnauthorizedException('Authentication required before tenant evaluation.');
    }

    // Resolve target organization from header or route parameters
    const headerOrgId = request.headers['x-organization-id'];
    const paramOrgId = request.params?.orgId || request.params?.organizationId;
    const targetOrgId: string | undefined =
      (typeof headerOrgId === 'string' && headerOrgId.trim() !== '' ? headerOrgId.trim() : undefined) ||
      (typeof paramOrgId === 'string' && paramOrgId.trim() !== '' ? paramOrgId.trim() : undefined);

    if (isTenantRequired && !targetOrgId) {
      throw new BadRequestException('Organization context required via X-Organization-ID header.');
    }

    // If no target organization specified and not strictly required, allow
    if (!targetOrgId) {
      return true;
    }

    let userRoles;
    try {
      // Fetch verified active roles from the server database
      userRoles = await this.authService.getUserRoles(user.sub);
    } catch (err) {
      this.logger.error(`Database failure during tenant lookup for user ID ${user.sub}: ${err}`);
      throw new ForbiddenException('Authorization lookup failed. Denying access (fail-closed).');
    }

    // Evaluate cross-tenant boundary using the authoritative domain policy
    const decision = evaluateTenantAccess({
      userStatus: user.status as UserStatus,
      userRoles,
      targetOrganizationId: targetOrgId,
      requiredPermission: 'org:access', // Base tenant membership verification
    });

    if (!decision.granted) {
      throw new ForbiddenException(decision.reason || 'Cross-tenant access prohibited.');
    }

    // Server-verified organization context attached to request
    request.organizationId = targetOrgId;
    return true;
  }
}

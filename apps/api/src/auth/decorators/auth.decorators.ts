import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@vertex/contracts';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const REQUIRE_TENANT_KEY = 'require_tenant';
export const RequireTenant = () => SetMetadata(REQUIRE_TENANT_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

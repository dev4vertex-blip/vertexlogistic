import { UserType, RoleScope, UserStatus } from '@prisma/client';

/**
 * Normalizes email address to prevent duplicate account creation via case differences
 * or leading/trailing whitespace. Supports RFC 5322 compliant emails including subaddressing/tags.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new Error('Email must be a non-empty string.');
  }

  const normalized = email.trim().toLowerCase();

  // Standard RFC 5322 permissive regex supporting plus-addressing (e.g. user+tag@domain.com) and multi-level TLDs
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!emailRegex.test(normalized)) {
    throw new Error(`Invalid email format: "${email}".`);
  }

  return normalized;
}

export interface RoleAssignmentParams {
  userType: UserType;
  roleScope: RoleScope;
  organizationId?: string | null;
}

export interface RoleAssignmentValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Cross-table invariant enforcement for role assignments.
 * Prevents SYSTEM_INTERNAL roles from being assigned to customer accounts
 * and prevents ORGANIZATION roles from acting without tenant scoping.
 */
export function validateRoleAssignment(params: RoleAssignmentParams): RoleAssignmentValidationResult {
  const { userType, roleScope, organizationId } = params;

  // Rule 1: SYSTEM_INTERNAL roles can ONLY be assigned to INTERNAL_EMPLOYEE users
  if (roleScope === RoleScope.SYSTEM_INTERNAL) {
    if (userType !== UserType.INTERNAL_EMPLOYEE) {
      return {
        isValid: false,
        errorCode: 'CROSS_BOUNDARY_VIOLATION',
        errorMessage: 'SYSTEM_INTERNAL roles cannot be assigned to CUSTOMER_USER accounts.',
      };
    }

    // Rule 2: SYSTEM_INTERNAL roles operate platform-wide and must have organizationId = NULL
    if (organizationId !== null && organizationId !== undefined && organizationId.trim() !== '') {
      return {
        isValid: false,
        errorCode: 'INVALID_SYSTEM_ROLE_SCOPE',
        errorMessage: 'SYSTEM_INTERNAL roles cannot be scoped to a customer organization.',
      };
    }
  }

  // Rule 3: ORGANIZATION roles MUST be scoped to a valid organizationId
  if (roleScope === RoleScope.ORGANIZATION) {
    if (!organizationId || organizationId.trim() === '') {
      return {
        isValid: false,
        errorCode: 'MISSING_ORGANIZATION_SCOPE',
        errorMessage: 'ORGANIZATION roles must be scoped to a valid organization ID.',
      };
    }
  }

  return { isValid: true };
}

export interface ExistingAssignmentItem {
  roleId: string;
  organizationId?: string | null;
}

/**
 * Validates duplicate role assignments honoring PostgreSQL NULL semantics.
 * Rejects duplicate (roleId, NULL) for internal roles and duplicate (roleId, orgId) for tenant roles.
 */
export function isDuplicateAssignment(
  existing: ExistingAssignmentItem[],
  target: { roleId: string; organizationId?: string | null },
): boolean {
  const targetOrg = target.organizationId && target.organizationId.trim() !== '' ? target.organizationId : null;

  return existing.some((item) => {
    const itemOrg = item.organizationId && item.organizationId.trim() !== '' ? item.organizationId : null;
    return item.roleId === target.roleId && itemOrg === targetOrg;
  });
}

export interface UserRoleEvaluationItem {
  roleScope: RoleScope;
  organizationId?: string | null;
  isActive: boolean;
  permissions: string[];
}

export interface TenantAccessEvaluationParams {
  userStatus?: UserStatus;
  userRoles: UserRoleEvaluationItem[];
  targetOrganizationId?: string | null;
  requiredPermission: string;
}

export interface TenantAccessResult {
  granted: boolean;
  reason?: string;
}

/**
 * Deny-by-default tenant authorization decision engine.
 * Ensures organization-scoped roles never authorize operations in another tenant.
 * Fails closed if any parameter is missing, mismatched, or if user is inactive.
 */
export function evaluateTenantAccess(params: TenantAccessEvaluationParams): TenantAccessResult {
  const { userStatus, userRoles, targetOrganizationId, requiredPermission } = params;

  // 1. Inactive / Suspended User Check
  if (userStatus && userStatus !== UserStatus.ACTIVE) {
    return {
      granted: false,
      reason: `DENIED: User account status is "${userStatus}". Only ACTIVE accounts are authorized.`,
    };
  }

  // 2. Roles Presence Check
  if (!userRoles || userRoles.length === 0) {
    return { granted: false, reason: 'DENIED: User has no assigned roles.' };
  }

  const activeRoles = userRoles.filter((r) => r.isActive);
  if (activeRoles.length === 0) {
    return { granted: false, reason: 'DENIED: User has no active roles.' };
  }

  // 3. Scenario A: Tenant-scoped operation (targetOrganizationId is present)
  if (targetOrganizationId && targetOrganizationId.trim() !== '') {
    // Only check roles explicitly scoped to targetOrganizationId
    const matchingTenantRoles = activeRoles.filter(
      (r) => r.roleScope === RoleScope.ORGANIZATION && r.organizationId === targetOrganizationId,
    );

    if (matchingTenantRoles.length === 0) {
      return {
        granted: false,
        reason: `DENIED: No active roles found for organization "${targetOrganizationId}". Cross-tenant access prohibited.`,
      };
    }

    const hasPermission = matchingTenantRoles.some((r) => r.permissions.includes(requiredPermission));
    if (!hasPermission) {
      return {
        granted: false,
        reason: `DENIED: Missing required permission "${requiredPermission}" in organization "${targetOrganizationId}".`,
      };
    }

    return { granted: true };
  }

  // 4. Scenario B: System-wide operational privilege (targetOrganizationId is null/undefined)
  const matchingSystemRoles = activeRoles.filter(
    (r) => r.roleScope === RoleScope.SYSTEM_INTERNAL && (r.organizationId === null || r.organizationId === undefined),
  );

  if (matchingSystemRoles.length === 0) {
    return {
      granted: false,
      reason: 'DENIED: Operation requires a SYSTEM_INTERNAL role.',
    };
  }

  const hasPermission = matchingSystemRoles.some((r) => r.permissions.includes(requiredPermission));
  if (!hasPermission) {
    return {
      granted: false,
      reason: `DENIED: Missing system permission "${requiredPermission}".`,
    };
  }

  return { granted: true };
}

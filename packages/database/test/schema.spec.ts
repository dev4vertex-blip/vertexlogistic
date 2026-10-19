import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { UserType, RoleScope, UserStatus } from '@prisma/client';
import {
  normalizeEmail,
  validateRoleAssignment,
  evaluateTenantAccess,
  isDuplicateAssignment,
} from '../src/auth/authorization-policy.js';

describe('@vertex/database - Core Domain Schema & Authorization Boundary Tests', () => {
  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
  const migrationPath = path.resolve(__dirname, '../prisma/migrations/20261019_init_core_domain/migration.sql');

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

  // 1. Schema & Migration Consistency
  it('1. should contain all 6 core domain models in schema and migration DDL', () => {
    const requiredModels = ['User', 'Organization', 'Role', 'Permission', 'RolePermission', 'UserRole'];
    const requiredTables = ['"users"', '"organizations"', '"roles"', '"permissions"', '"role_permissions"', '"user_roles"'];

    for (const model of requiredModels) {
      expect(schemaContent).toContain(`model ${model}`);
    }

    for (const table of requiredTables) {
      expect(migrationContent).toContain(`CREATE TABLE ${table}`);
    }
  });

  // 2. Identity Security (Password Hash Only, Zero Plaintext)
  it('2. should enforce password hash only and reject plaintext password fields', () => {
    expect(schemaContent).toContain('passwordHash');
    expect(migrationContent).toContain('"password_hash" TEXT NOT NULL');

    // Negative assertions: plaintext passwords must never exist
    expect(schemaContent).not.toMatch(/\bpassword\s+String\b/i);
    expect(migrationContent).not.toMatch(/"password"\s+TEXT/i);
  });

  // 3. MFA Metadata Only (No Auth Flow Logic in Schema)
  it('3. should store MFA configuration status metadata only', () => {
    expect(schemaContent).toContain('mfaEnabled');
    expect(schemaContent).toContain('mfaType');
    expect(migrationContent).toContain('"mfa_enabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migrationContent).toContain('"mfa_type" "MfaType" NOT NULL DEFAULT \'NONE\'');
  });

  // 4. Multi-Tenant Organization Boundaries & Optional GSTIN
  it('4. should support multi-tenant organizations with unique code and optional GSTIN', () => {
    expect(schemaContent).toContain('gstin            String?            @unique');
    expect(schemaContent).toContain('code             String             @unique');
    expect(migrationContent).toContain('"organizations_gstin_key" ON "organizations"("gstin")');
    expect(migrationContent).toContain('"organizations_code_key" ON "organizations"("code")');
  });

  // 5. Internal vs Customer Separation
  it('5. should separate internal Vertex staff from customer organization users', () => {
    expect(schemaContent).toContain('enum UserType');
    expect(schemaContent).toContain('INTERNAL_EMPLOYEE');
    expect(schemaContent).toContain('CUSTOMER_USER');
    expect(migrationContent).toContain('CREATE TYPE "UserType" AS ENUM (\'INTERNAL_EMPLOYEE\', \'CUSTOMER_USER\')');
  });

  // 6. UserRole Uniqueness with PostgreSQL NULL Semantics Protection
  it('6. should enforce partial unique indexes for both org-scoped and internal-scoped role assignments', () => {
    // Standard composite index
    expect(migrationContent).toContain(
      'CREATE UNIQUE INDEX "user_roles_user_id_role_id_organization_id_key" ON "user_roles"("user_id", "role_id", "organization_id")',
    );
    // Explicit partial unique index where organization_id IS NOT NULL
    expect(migrationContent).toContain(
      'CREATE UNIQUE INDEX "user_roles_org_scoped_unique_idx" ON "user_roles"("user_id", "role_id", "organization_id") WHERE "organization_id" IS NOT NULL',
    );
    // Explicit partial unique index where organization_id IS NULL (protecting internal duplicate assignments)
    expect(migrationContent).toContain(
      'CREATE UNIQUE INDEX "user_roles_internal_scoped_unique_idx" ON "user_roles"("user_id", "role_id") WHERE "organization_id" IS NULL',
    );
  });

  // 7. Case-Insensitive Email Identity Normalization & Format Verification
  it('7. should normalize emails (trim, lowercase) and accept legitimate subaddressing and TLDs', () => {
    expect(migrationContent).toContain('CREATE UNIQUE INDEX "users_email_lower_key" ON "users"(LOWER("email"))');

    // Case and whitespace normalization
    expect(normalizeEmail('  Alice.Developer@Vertex.COM ')).toBe('alice.developer@vertex.com');
    // Plus-addressing / subaddressing
    expect(normalizeEmail('user+billing@domain.com')).toBe('user+billing@domain.com');
    // Multi-level enterprise domain
    expect(normalizeEmail('ops.dispatch@hub.vertex.co.in')).toBe('ops.dispatch@hub.vertex.co.in');

    // Invalid formats rejected
    expect(() => normalizeEmail('invalid-email-address')).toThrowError(/Invalid email format/);
    expect(() => normalizeEmail('@domain.com')).toThrowError(/Invalid email format/);
    expect(() => normalizeEmail('user@')).toThrowError(/Invalid email format/);
    expect(() => normalizeEmail('user with spaces@domain.com')).toThrowError(/Invalid email format/);
    expect(() => normalizeEmail('')).toThrowError(/Email must be a non-empty string/);
  });

  // 8. Duplicate Role Assignment Validation Honoring NULL Semantics
  it('8. should identify duplicate role assignments for both internal and tenant-scoped roles', () => {
    const existing = [
      { roleId: 'role-super-admin', organizationId: null },
      { roleId: 'role-branch-mgr', organizationId: 'org-delhi-hub' },
    ];

    // Duplicate internal assignment (both NULL org)
    expect(isDuplicateAssignment(existing, { roleId: 'role-super-admin', organizationId: null })).toBe(true);
    expect(isDuplicateAssignment(existing, { roleId: 'role-super-admin', organizationId: '' })).toBe(true);

    // Duplicate tenant assignment (same role and same org)
    expect(isDuplicateAssignment(existing, { roleId: 'role-branch-mgr', organizationId: 'org-delhi-hub' })).toBe(true);

    // Distinct assignment: same role, different organization -> NOT duplicate
    expect(isDuplicateAssignment(existing, { roleId: 'role-branch-mgr', organizationId: 'org-mumbai-hub' })).toBe(false);

    // Distinct assignment: different role in same organization -> NOT duplicate
    expect(isDuplicateAssignment(existing, { roleId: 'role-dispatcher', organizationId: 'org-delhi-hub' })).toBe(false);
  });

  // 9. Role Scope Invariant Enforcement (Executable Domain Logic)
  it('9. should reject assigning SYSTEM_INTERNAL roles to CUSTOMER_USER accounts', () => {
    const invalidResult = validateRoleAssignment({
      userType: UserType.CUSTOMER_USER,
      roleScope: RoleScope.SYSTEM_INTERNAL,
      organizationId: null,
    });

    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errorCode).toBe('CROSS_BOUNDARY_VIOLATION');
    expect(invalidResult.errorMessage).toContain('SYSTEM_INTERNAL roles cannot be assigned to CUSTOMER_USER');

    const validResult = validateRoleAssignment({
      userType: UserType.INTERNAL_EMPLOYEE,
      roleScope: RoleScope.SYSTEM_INTERNAL,
      organizationId: null,
    });
    expect(validResult.isValid).toBe(true);
  });

  // 10. Organization Role Scope Invariant Enforcement
  it('10. should reject ORGANIZATION roles that lack an organizationId', () => {
    const invalidResult = validateRoleAssignment({
      userType: UserType.CUSTOMER_USER,
      roleScope: RoleScope.ORGANIZATION,
      organizationId: null,
    });

    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errorCode).toBe('MISSING_ORGANIZATION_SCOPE');

    const validResult = validateRoleAssignment({
      userType: UserType.CUSTOMER_USER,
      roleScope: RoleScope.ORGANIZATION,
      organizationId: 'org-12345-uuid',
    });
    expect(validResult.isValid).toBe(true);
  });

  // 11. Inactive & Suspended Account Rejection
  it('11. should deny access when user account is SUSPENDED, DEACTIVATED, or PENDING_VERIFICATION', () => {
    const userRoles = [
      {
        roleScope: RoleScope.ORGANIZATION,
        organizationId: 'org-tenant-alpha',
        isActive: true,
        permissions: ['shipment:create'],
      },
    ];

    const suspendedAttempt = evaluateTenantAccess({
      userStatus: UserStatus.SUSPENDED,
      userRoles,
      targetOrganizationId: 'org-tenant-alpha',
      requiredPermission: 'shipment:create',
    });
    expect(suspendedAttempt.granted).toBe(false);
    expect(suspendedAttempt.reason).toContain('User account status is "SUSPENDED"');

    const pendingAttempt = evaluateTenantAccess({
      userStatus: UserStatus.PENDING_VERIFICATION,
      userRoles,
      targetOrganizationId: 'org-tenant-alpha',
      requiredPermission: 'shipment:create',
    });
    expect(pendingAttempt.granted).toBe(false);
    expect(pendingAttempt.reason).toContain('User account status is "PENDING_VERIFICATION"');
  });

  // 12. Deny-by-Default Cross-Tenant Authorization Decision Engine
  it('12. should strictly deny cross-tenant access and fail closed', () => {
    const userRoles = [
      {
        roleScope: RoleScope.ORGANIZATION,
        organizationId: 'org-tenant-alpha',
        isActive: true,
        permissions: ['shipment:create', 'shipment:read'],
      },
    ];

    // Case A: Accessing own organization with granted permission -> ALLOWED
    const accessOwn = evaluateTenantAccess({
      userStatus: UserStatus.ACTIVE,
      userRoles,
      targetOrganizationId: 'org-tenant-alpha',
      requiredPermission: 'shipment:create',
    });
    expect(accessOwn.granted).toBe(true);

    // Case B: Cross-tenant attempt (trying to access org-tenant-beta) -> DENIED
    const crossTenantAttempt = evaluateTenantAccess({
      userStatus: UserStatus.ACTIVE,
      userRoles,
      targetOrganizationId: 'org-tenant-beta',
      requiredPermission: 'shipment:create',
    });
    expect(crossTenantAttempt.granted).toBe(false);
    expect(crossTenantAttempt.reason).toContain('Cross-tenant access prohibited');

    // Case C: Missing required permission -> DENIED
    const missingPermAttempt = evaluateTenantAccess({
      userStatus: UserStatus.ACTIVE,
      userRoles,
      targetOrganizationId: 'org-tenant-alpha',
      requiredPermission: 'billing:delete_all',
    });
    expect(missingPermAttempt.granted).toBe(false);
    expect(missingPermAttempt.reason).toContain('Missing required permission');

    // Case D: Inactive role -> DENIED
    const inactiveRole = evaluateTenantAccess({
      userStatus: UserStatus.ACTIVE,
      userRoles: [{ ...userRoles[0]!, isActive: false }],
      targetOrganizationId: 'org-tenant-alpha',
      requiredPermission: 'shipment:create',
    });
    expect(inactiveRole.granted).toBe(false);
    expect(inactiveRole.reason).toContain('no active roles');

    // Case E: Empty roles array -> FAIL CLOSED
    const emptyRoles = evaluateTenantAccess({
      userStatus: UserStatus.ACTIVE,
      userRoles: [],
      targetOrganizationId: 'org-tenant-alpha',
      requiredPermission: 'shipment:create',
    });
    expect(emptyRoles.granted).toBe(false);
  });

  // 13. Referential Integrity & Deletion Rules
  it('13. should enforce CASCADE deletion for memberships and RESTRICT deletion for active roles', () => {
    // If a user is deleted, their role assignments are removed
    expect(migrationContent).toContain(
      'ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE',
    );
    // If an organization is deleted, its user roles are cleaned up
    expect(migrationContent).toContain(
      'ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE',
    );
    // A role CANNOT be deleted if it is assigned to any user (RESTRICT)
    expect(migrationContent).toContain(
      'ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT',
    );
  });
});

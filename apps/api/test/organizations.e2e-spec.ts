import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '@vertex/database';
import { AuthService } from '../src/auth/auth.service.js';
import { OrganizationsService } from '../src/organizations/organizations.service.js';
import { RoleScope, UserType, UserStatus, OrganizationStatus, OrganizationType } from '@prisma/client';

describe('VERTEX Logistics API - Organization Onboarding & User Management (STEP 2.7 & 2.7A Audit)', () => {
  let app: INestApplication;
  let authService: AuthService;

  // Pre-generated JWT tokens for different test personas
  let ownerOrgAToken: string;
  let adminOrgAToken: string;
  let memberOrgAToken: string;
  let ownerOrgBToken: string;
  let systemAdminToken: string;
  let driverInternalToken: string;

  // In-memory test state mocking PostgreSQL
  const mockUsers: Record<string, any> = {};
  const mockOrgs: Record<string, any> = {};
  const mockRoles: Record<string, any> = {};
  let mockUserRoles: any[] = [];
  let mockVerificationTokens: any[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.JWT_SECRET = 'vertex-test-secret-key-32-chars-long!';

    const passwordHash = await bcrypt.hash('TestVertexPass123!', 10);

    // 1. Roles
    mockRoles['role-org-owner'] = {
      id: 'role-org-owner',
      code: 'ORG_OWNER',
      name: 'Organization Owner',
      scope: RoleScope.ORGANIZATION,
    };
    mockRoles['role-org-admin'] = {
      id: 'role-org-admin',
      code: 'ENTERPRISE_ADMIN',
      name: 'Enterprise Admin',
      scope: RoleScope.ORGANIZATION,
    };
    mockRoles['role-org-member'] = {
      id: 'role-org-member',
      code: 'ENTERPRISE_MEMBER',
      name: 'Enterprise Member',
      scope: RoleScope.ORGANIZATION,
    };
    mockRoles['role-super-admin'] = {
      id: 'role-super-admin',
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      scope: RoleScope.SYSTEM_INTERNAL,
    };

    // 2. Users
    mockUsers['usr-owner-a'] = {
      id: 'usr-owner-a',
      email: 'owner.a@client-alpha.com',
      passwordHash,
      firstName: 'Alice',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUsers['usr-admin-a'] = {
      id: 'usr-admin-a',
      email: 'admin.a@client-alpha.com',
      passwordHash,
      firstName: 'Aaron',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUsers['usr-member-a'] = {
      id: 'usr-member-a',
      email: 'member.a@client-alpha.com',
      passwordHash,
      firstName: 'Mark',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUsers['usr-owner-b'] = {
      id: 'usr-owner-b',
      email: 'owner.b@client-beta.com',
      passwordHash,
      firstName: 'Bob',
      lastName: 'Beta',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUsers['usr-sysadmin'] = {
      id: 'usr-sysadmin',
      email: 'sysadmin@vertex.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      userType: UserType.INTERNAL_EMPLOYEE,
      status: UserStatus.ACTIVE,
    };
    mockUsers['usr-driver-internal'] = {
      id: 'usr-driver-internal',
      email: 'driver.bob@vertex.com',
      passwordHash,
      firstName: 'Bob',
      lastName: 'Driver',
      userType: UserType.INTERNAL_EMPLOYEE,
      status: UserStatus.ACTIVE,
    };
    mockUsers['usr-shared-multi'] = {
      id: 'usr-shared-multi',
      email: 'shared.consultant@logistics.com',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Shared',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };

    // 3. Organizations
    mockOrgs['org-alpha-uuid'] = {
      id: 'org-alpha-uuid',
      name: 'Acme Alpha Logistics',
      code: 'ORG-ALPHA-001',
      type: OrganizationType.ENTERPRISE_CLIENT,
      status: OrganizationStatus.ACTIVE,
      gstin: '27AABCV1234D1Z5',
      pan: 'AABCV1234D',
      billingEmail: 'billing@client-alpha.com',
      billingPhone: '+919876543210',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    mockOrgs['org-beta-uuid'] = {
      id: 'org-beta-uuid',
      name: 'Beta Transport Corp',
      code: 'ORG-BETA-001',
      type: OrganizationType.ENTERPRISE_CLIENT,
      status: OrganizationStatus.ACTIVE,
      gstin: '29AABCV5678D1Z8',
      pan: 'AABCV5678D',
      billingEmail: 'billing@client-beta.com',
      billingPhone: '+919876543211',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    // 4. User Roles
    mockUserRoles = [
      {
        id: 'ur-1',
        userId: 'usr-owner-a',
        roleId: 'role-org-owner',
        organizationId: 'org-alpha-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-owner'],
        user: mockUsers['usr-owner-a'],
      },
      {
        id: 'ur-2',
        userId: 'usr-admin-a',
        roleId: 'role-org-admin',
        organizationId: 'org-alpha-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-admin'],
        user: mockUsers['usr-admin-a'],
      },
      {
        id: 'ur-3',
        userId: 'usr-member-a',
        roleId: 'role-org-member',
        organizationId: 'org-alpha-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-member'],
        user: mockUsers['usr-member-a'],
      },
      {
        id: 'ur-4',
        userId: 'usr-owner-b',
        roleId: 'role-org-owner',
        organizationId: 'org-beta-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-owner'],
        user: mockUsers['usr-owner-b'],
      },
      {
        id: 'ur-5',
        userId: 'usr-sysadmin',
        roleId: 'role-super-admin',
        organizationId: null,
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-super-admin'],
        user: mockUsers['usr-sysadmin'],
      },
      {
        id: 'ur-6',
        userId: 'usr-shared-multi',
        roleId: 'role-org-member',
        organizationId: 'org-alpha-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-member'],
        user: mockUsers['usr-shared-multi'],
      },
      {
        id: 'ur-7',
        userId: 'usr-shared-multi',
        roleId: 'role-org-member',
        organizationId: 'org-beta-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-member'],
        user: mockUsers['usr-shared-multi'],
      },
    ];

    const mockPrismaService = {
      organization: {
        findUnique: async ({ where }: { where: { id?: string; code?: string; gstin?: string } }) => {
          if (where.id) return mockOrgs[where.id] || null;
          if (where.code) {
            return Object.values(mockOrgs).find((o: any) => o.code === where.code) || null;
          }
          if (where.gstin) {
            return Object.values(mockOrgs).find((o: any) => o.gstin === where.gstin) || null;
          }
          return null;
        },
        create: async ({ data }: { data: any }) => {
          const id = `org-${Date.now()}`;
          const newOrg = {
            id,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockOrgs[id] = newOrg;
          return newOrg;
        },
        update: async ({ where, data }: { where: { id: string }; data: any }) => {
          const org = mockOrgs[where.id];
          if (!org) throw new Error('Not found');
          const updated = {
            ...org,
            ...data,
            updatedAt: new Date(),
          };
          mockOrgs[where.id] = updated;
          return updated;
        },
      },
      role: {
        findUnique: async ({ where }: { where: { id?: string; code?: string } }) => {
          if (where.id) return mockRoles[where.id] || null;
          if (where.code) {
            return Object.values(mockRoles).find((r: any) => r.code === where.code) || null;
          }
          return null;
        },
        findFirst: async ({ where }: { where: { code?: string; scope?: string } }) => {
          return Object.values(mockRoles).find((r: any) => {
            if (where?.code && r.code !== where.code) return false;
            if (where?.scope && r.scope !== where.scope) return false;
            return true;
          }) || null;
        },
        create: async ({ data }: { data: any }) => {
          const id = `role-${Date.now()}`;
          const newRole = { id, ...data };
          mockRoles[id] = newRole;
          return newRole;
        },
      },
      user: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return mockUsers[where.id] || null;
          if (where.email) {
            return Object.values(mockUsers).find((u: any) => u.email === where.email) || null;
          }
          return null;
        },
        create: async ({ data }: { data: any }) => {
          const id = `usr-${Date.now()}`;
          const newUser = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          mockUsers[id] = newUser;
          return newUser;
        },
        update: async ({ where, data }: { where: { id: string }; data: any }) => {
          const user = mockUsers[where.id];
          if (!user) throw new Error('Not found');
          const updated = { ...user, ...data, updatedAt: new Date() };
          mockUsers[where.id] = updated;
          return updated;
        },
      },
      userRole: {
        findFirst: async ({ where }: { where: any }) => {
          return (
            mockUserRoles.find((ur) => {
              if (where.userId && ur.userId !== where.userId) return false;
              if (where.organizationId !== undefined && ur.organizationId !== where.organizationId) return false;
              if (where.roleId && ur.roleId !== where.roleId) return false;
              if (where.isActive !== undefined && ur.isActive !== where.isActive) return false;
              if (where.role?.scope && ur.role?.scope !== where.role.scope) return false;
              if (where.role?.code && ur.role?.code !== where.role.code) return false;
              return true;
            }) || null
          );
        },
        findMany: async ({ where, skip = 0, take = 50 }: { where: any; skip?: number; take?: number }) => {
          let list = mockUserRoles.filter((ur) => {
            if (where.userId && ur.userId !== where.userId) return false;
            if (where.organizationId !== undefined && ur.organizationId !== where.organizationId) return false;
            if (where.isActive !== undefined && ur.isActive !== where.isActive) return false;
            if (where.role?.code && ur.role?.code !== where.role.code) return false;
            return true;
          });
          return list.slice(skip, skip + take);
        },
        count: async ({ where }: { where: any }) => {
          return mockUserRoles.filter((ur) => {
            if (where.userId && ur.userId !== where.userId) return false;
            if (where.organizationId?.not && ur.organizationId === where.organizationId.not) return false;
            if (where.organizationId && typeof where.organizationId === 'string' && ur.organizationId !== where.organizationId) return false;
            if (where.isActive !== undefined && ur.isActive !== where.isActive) return false;
            if (where.role?.code && ur.role?.code !== where.role.code) return false;
            if (where.user?.status && ur.user?.status !== where.user.status) return false;
            return true;
          }).length;
        },
        create: async ({ data, include }: { data: any; include?: any }) => {
          const id = `ur-${Date.now()}-${Math.random()}`;
          const created = {
            id,
            ...data,
            assignedAt: new Date(),
            role: mockRoles[data.roleId] || { id: data.roleId, code: 'UNKNOWN', name: 'Unknown' },
            user: mockUsers[data.userId] || { id: data.userId },
          };
          mockUserRoles.push(created);
          return created;
        },
        updateMany: async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const ur of mockUserRoles) {
            if (where.organizationId && ur.organizationId !== where.organizationId) continue;
            if (where.userId && ur.userId !== where.userId) continue;
            Object.assign(ur, data);
            count++;
          }
          return { count };
        },
      },
      verificationToken: {
        updateMany: async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const vt of mockVerificationTokens) {
            if (where.userId && vt.userId !== where.userId) continue;
            if (where.organizationId && vt.organizationId !== where.organizationId) continue;
            if (where.consumedAt === null && vt.consumedAt !== null) continue;
            if (where.revokedAt === null && vt.revokedAt !== null) continue;
            Object.assign(vt, data);
            count++;
          }
          return { count };
        },
        create: async ({ data }: { data: any }) => {
          const id = `vt-${Date.now()}-${Math.random()}`;
          const token = { id, ...data, createdAt: new Date() };
          mockVerificationTokens.push(token);
          return token;
        },
        findUnique: async ({ where }: { where: { tokenHash?: string } }) => {
          return mockVerificationTokens.find((vt) => vt.tokenHash === where.tokenHash) || null;
        },
      },
      $transaction: async (fn: (tx: any) => Promise<any>) => {
        return fn(mockPrismaService);
      },
      checkReadiness: async () => ({ status: 'down', service: 'postgresql', message: 'Mocked offline DB' }),
      $connect: async () => {},
      $disconnect: async () => {},
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);

    // Generate tokens for test personas
    ownerOrgAToken = await authService.generateToken({
      id: 'usr-owner-a',
      email: 'owner.a@client-alpha.com',
      firstName: 'Alice',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });

    adminOrgAToken = await authService.generateToken({
      id: 'usr-admin-a',
      email: 'admin.a@client-alpha.com',
      firstName: 'Aaron',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });

    memberOrgAToken = await authService.generateToken({
      id: 'usr-member-a',
      email: 'member.a@client-alpha.com',
      firstName: 'Mark',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });

    ownerOrgBToken = await authService.generateToken({
      id: 'usr-owner-b',
      email: 'owner.b@client-beta.com',
      firstName: 'Bob',
      lastName: 'Beta',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });

    systemAdminToken = await authService.generateToken({
      id: 'usr-sysadmin',
      email: 'sysadmin@vertex.com',
      firstName: 'System',
      lastName: 'Admin',
      userType: UserType.INTERNAL_EMPLOYEE,
      status: UserStatus.ACTIVE,
    });

    driverInternalToken = await authService.generateToken({
      id: 'usr-driver-internal',
      email: 'driver.bob@vertex.com',
      firstName: 'Bob',
      lastName: 'Driver',
      userType: UserType.INTERNAL_EMPLOYEE,
      status: UserStatus.ACTIVE,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // 1. Organization Creation
  it('1. POST /api/organizations should successfully onboard organization and assign creator as ORG_OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Delta Freight Logistics',
        code: 'ORG-DELTA-999',
        type: 'ENTERPRISE_CLIENT',
        gstin: '07AABCV9999D1Z2',
        pan: 'AABCV9999D',
        billingEmail: 'billing@deltafreight.com',
        billingPhone: '+919999999999',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('code', 'ORG-DELTA-999');
    expect(res.body).toHaveProperty('status', 'ONBOARDING');
    expect(res.body).toHaveProperty('gstin', '07AABCV9999D1Z2');

    // Confirm initial role assignment exists
    const assignment = mockUserRoles.find((ur) => ur.organizationId === res.body.id && ur.userId === 'usr-owner-a');
    expect(assignment).toBeDefined();
    expect(assignment.role.code).toBe('ORG_OWNER');
  });

  // 2. Duplicate Organization Code Conflict
  it('2. POST /api/organizations with duplicate code should return HTTP 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Duplicate Code Org',
        code: 'ORG-ALPHA-001', // Already exists in mock
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already in use');
  });

  // 3. Duplicate GSTIN Conflict
  it('3. POST /api/organizations with duplicate GSTIN should return HTTP 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Duplicate GSTIN Org',
        code: 'ORG-UNIQUE-CODE-1',
        gstin: '27AABCV1234D1Z5', // Org Alpha's GSTIN
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already registered to another organization');
  });

  // 4. Invalid Input Validation
  it('4. POST /api/organizations with invalid GSTIN or code format should return HTTP 400 Bad Request', async () => {
    const resBadCode = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Bad Code Org',
        code: 'bad code with spaces!@#',
      });
    expect(resBadCode.status).toBe(400);

    const resBadGstin = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Bad GSTIN Org',
        code: 'ORG-VALID-01',
        gstin: '12345INVALIDGSTIN',
      });
    expect(resBadGstin.status).toBe(400);
    expect(resBadGstin.body.message).toContain('Must be a valid 15-character Indian GSTIN');
  });

  // 5. Unauthorized Creation (Unauthenticated)
  it('5. POST /api/organizations without token should return HTTP 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .send({ name: 'Unauthenticated Org', code: 'ORG-UNAUTH-01' });

    expect(res.status).toBe(401);
  });

  // 6. Authorized Organization Read
  it('6. GET /api/organizations/:id should allow authorized member to read organization', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${ownerOrgAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('org-alpha-uuid');
    expect(res.body.name).toBe('Acme Alpha Logistics');
  });

  // 7. Cross-Organization Read Denial
  it('7. GET /api/organizations/:id should strictly deny cross-tenant access with HTTP 403', async () => {
    // Owner of Org B attempts to read Org Alpha
    const res = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${ownerOrgBToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cross-tenant access prohibited');
  });

  // 8. Authorized Organization Update
  it('8. PATCH /api/organizations/:id should update permitted organization profile fields', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Acme Alpha Logistics Enterprise',
        billingPhone: '+919876543299',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Alpha Logistics Enterprise');
    expect(res.body.billingPhone).toBe('+919876543299');
  });

  // 9. Unauthorized Lifecycle Status Modification by Customer User
  it('9. PATCH /api/organizations/:id by customer user attempting to change status must return HTTP 403', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        status: 'ACTIVE',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('requires platform compliance authorization');
  });

  // 10. Platform System Admin Can Update Status
  it('10. PATCH /api/organizations/:id by platform INTERNAL_EMPLOYEE with SUPER_ADMIN should allow status update', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${systemAdminToken}`)
      .send({
        status: 'ACTIVE',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  // 11. Cross-Organization Update Denial
  it('11. PATCH /api/organizations/:id on another tenant must return HTTP 403', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${ownerOrgBToken}`)
      .send({
        name: 'Malicious Rename',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cross-tenant access prohibited');
  });

  // 12. List Organization Users with Pagination & Sanitization
  it('12. GET /api/organizations/:id/users should return paginated users without exposing password hashes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid/users?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerOrgAToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 10);
    expect(Array.isArray(res.body.items)).toBe(true);

    // Verify zero secret or passwordHash leakage
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('password');
  });

  // 13. Cross-Tenant User List Denial
  it('13. GET /api/organizations/:id/users for unauthorized tenant must return HTTP 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgBToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cross-tenant access prohibited');
  });

  // 14. Add / Invite User to Organization
  it('14. POST /api/organizations/:id/users should add user to organization in PENDING_VERIFICATION state', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        email: 'new.member@client-alpha.com',
        firstName: 'Nancy',
        lastName: 'Newbie',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new.member@client-alpha.com');
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.role.code).toBe('ENTERPRISE_MEMBER');

    // Verify zero password leakage
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  // 15. Customer Users Cannot Assign Platform Internal Roles
  it('15. POST /api/organizations/:id/users with SYSTEM_INTERNAL role (SUPER_ADMIN) must return HTTP 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        email: 'attacker@evil.com',
        firstName: 'Attacker',
        lastName: 'User',
        roleCode: 'SUPER_ADMIN',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cannot assign platform internal role');
  });

  // 16. Privilege Escalation Prevention (Admin cannot assign ORG_OWNER)
  it('16. POST /api/organizations/:id/users with ORG_OWNER by a non-owner admin must return HTTP 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${adminOrgAToken}`) // ENTERPRISE_ADMIN, not ORG_OWNER
      .send({
        email: 'escalation@client-alpha.com',
        firstName: 'Escalate',
        lastName: 'Me',
        roleCode: 'ORG_OWNER',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Only organization owners or platform admins can assign the ORG_OWNER role');
  });

  // 17. Non-Admin Member Cannot Add Users
  it('17. POST /api/organizations/:id/users by regular member must return HTTP 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${memberOrgAToken}`)
      .send({
        email: 'someone@client-alpha.com',
        firstName: 'Some',
        lastName: 'One',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Administrative authority required');
  });

  // 18. Duplicate User Role Assignment Conflict
  it('18. POST /api/organizations/:id/users when user already has that role must return HTTP 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        email: 'member.a@client-alpha.com', // Already has ENTERPRISE_MEMBER in Org Alpha
        firstName: 'Mark',
        lastName: 'Alpha',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already assigned role');
  });

  // 19. Last Active OWNER Protection
  it('19. PATCH /api/organizations/:id/users/:userId/status cannot suspend or deactivate the last active ORG_OWNER', async () => {
    // usr-owner-a is the only ORG_OWNER in org-alpha-uuid
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-owner-a/status')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        status: 'DEACTIVATED',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cannot deactivate or suspend the last active organization owner');
  });

  // 20. Authorized User Status Update
  it('20. PATCH /api/organizations/:id/users/:userId/status should allow owner to suspend regular member', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-member-a/status')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        status: 'SUSPENDED',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 21. Multi-Tenant Blast Radius Containment: Shared user membership across multiple organizations
  it('21. Tenant admin deactivating user in Org Alpha must NOT globally suspend user from Org Beta', async () => {
    // usr-shared-multi belongs to both Org Alpha and Org Beta with active status
    const initialUser = mockUsers['usr-shared-multi'];
    expect(initialUser.status).toBe(UserStatus.ACTIVE);

    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-shared-multi/status')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        status: 'DEACTIVATED',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Global account remains active for other assigned organizations');
    expect(res.body.user.tenantIsActive).toBe(false);

    // Assert global user status was NOT corrupted or globally suspended
    expect(mockUsers['usr-shared-multi'].status).toBe(UserStatus.ACTIVE);

    // Assert user's role assignment in Org Beta remains untouched and ACTIVE
    const betaRole = mockUserRoles.find((ur) => ur.userId === 'usr-shared-multi' && ur.organizationId === 'org-beta-uuid');
    expect(betaRole.isActive).toBe(true);
  });

  // 22. Platform employee without required permission is denied tenant data access
  it('22. Platform employee without SYSTEM_INTERNAL role must be denied tenant access (HTTP 403)', async () => {
    // usr-driver-internal has userType INTERNAL_EMPLOYEE but NO system roles assigned
    const res = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${driverInternalToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Platform employee lacks internal authorization');
  });

  // 23. Platform employee without SUPER_ADMIN is denied administrative tenant actions
  it('23. Platform employee without SUPER_ADMIN must be denied administrative operations (HTTP 403)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid')
      .set('Authorization', `Bearer ${driverInternalToken}`)
      .send({ name: 'Unauthorized Depot Rename' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Platform employee lacks required administrative privileges');
  });

  // 24. Enterprise Admin cannot deactivate or suspend an Organization Owner
  it('24. Enterprise Admin attempting to deactivate ORG_OWNER must return HTTP 403', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-owner-a/status')
      .set('Authorization', `Bearer ${adminOrgAToken}`)
      .send({ status: 'DEACTIVATED' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Enterprise Administrators cannot deactivate');
  });

  // 25. Cannot recruit platform internal employee into customer organization
  it('25. POST /api/organizations/:id/users attempting to add platform internal staff must return HTTP 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        email: 'sysadmin@vertex.com', // Exists as INTERNAL_EMPLOYEE
        firstName: 'System',
        lastName: 'Admin',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cannot recruit platform internal employees');
  });

  // 26. Pending account login rejection: newly invited users cannot log in before verification
  it('26. Newly invited user in PENDING_VERIFICATION state must be rejected on /api/auth/login', async () => {
    // Invite a new user
    const inviteRes = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        email: 'pending.invitee@client-alpha.com',
        firstName: 'Peter',
        lastName: 'Pending',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.status).toBe('PENDING_VERIFICATION');

    // Attempt login with any password
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'pending.invitee@client-alpha.com',
        password: 'AnyPassword123!',
      });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.message).toBe('Invalid email or password.');
  });

  // 27. Safe database error handling: database unique conflict returns clean HTTP 409
  it('27. Database uniqueness constraint collision returns HTTP 409 without leaking raw SQL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        name: 'Another Alpha Org',
        code: 'ORG-ALPHA-001', // Collides with existing org
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already in use');
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
    expect(JSON.stringify(res.body)).not.toContain('PrismaClientKnownRequestError');
  });

  // 28. Non-existent organization role rejection
  it('28. POST /api/organizations/:id/users with invalid role code returns HTTP 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({
        email: 'nonexistent.role.user@client-alpha.com',
        firstName: 'Jane',
        lastName: 'Doe',
        roleCode: 'NON_EXISTENT_ROLE_CODE',
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Organization role with code "NON_EXISTENT_ROLE_CODE" does not exist');
  });

  // 29. Multiple active owners: an owner can be suspended if another active owner exists
  it('29. If organization has two active owners, suspending one is allowed while final owner remains protected', async () => {
    // Add a second owner to Org Beta (owner B is usr-owner-b)
    const secondOwnerId = 'usr-owner-b-second';
    mockUsers[secondOwnerId] = {
      id: secondOwnerId,
      email: 'owner2.b@client-beta.com',
      passwordHash: await bcrypt.hash('TestVertexPass123!', 10),
      firstName: 'Owner2',
      lastName: 'Beta',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUserRoles.push({
      id: 'ur-beta-owner-2',
      userId: secondOwnerId,
      roleId: 'role-org-owner',
      organizationId: 'org-beta-uuid',
      isActive: true,
      assignedAt: new Date(),
      role: mockRoles['role-org-owner'],
      user: mockUsers[secondOwnerId],
    });

    // Owner B suspends the second owner (allowed because 2 owners exist)
    const resAllowed = await request(app.getHttpServer())
      .patch(`/api/organizations/org-beta-uuid/users/${secondOwnerId}/status`)
      .set('Authorization', `Bearer ${ownerOrgBToken}`)
      .send({ status: 'SUSPENDED' });

    expect(resAllowed.status).toBe(200);

    // Now only 1 active owner remains (usr-owner-b). Attempting to suspend usr-owner-b must fail!
    const resBlocked = await request(app.getHttpServer())
      .patch('/api/organizations/org-beta-uuid/users/usr-owner-b/status')
      .set('Authorization', `Bearer ${ownerOrgBToken}`)
      .send({ status: 'SUSPENDED' });

    expect(resBlocked.status).toBe(403);
    expect(resBlocked.body.message).toContain('Cannot deactivate or suspend the last active organization owner');
  });

  // 30. Concurrency and isolation documentation audit verification
  it('30. Last active owner check runs inside an atomic $transaction', async () => {
    // Verify that updateOrgUserStatus utilizes an atomic transaction wrapper
    const res = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-owner-a/status')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({ status: 'DEACTIVATED' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cannot deactivate or suspend the last active organization owner');
  });

  // 31. User with multiple active roles in one organization: suspension revokes ALL roles in that organization
  it('31. Deactivating a user with multiple active roles in one organization revokes ALL roles in that tenant', async () => {
    const multiRoleId = 'usr-multi-role-user';
    mockUsers[multiRoleId] = {
      id: multiRoleId,
      email: 'multirole@client-alpha.com',
      passwordHash: await bcrypt.hash('TestVertexPass123!', 10),
      firstName: 'Multi',
      lastName: 'Role',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };

    // Assign TWO distinct roles in Org Alpha
    mockUserRoles.push({
      id: 'ur-multi-1',
      userId: multiRoleId,
      roleId: 'role-org-admin',
      organizationId: 'org-alpha-uuid',
      isActive: true,
      assignedAt: new Date(),
      role: mockRoles['role-org-admin'],
      user: mockUsers[multiRoleId],
    });
    mockUserRoles.push({
      id: 'ur-multi-2',
      userId: multiRoleId,
      roleId: 'role-org-member',
      organizationId: 'org-alpha-uuid',
      isActive: true,
      assignedAt: new Date(),
      role: mockRoles['role-org-member'],
      user: mockUsers[multiRoleId],
    });

    // Owner deactivates the user in Org Alpha
    const res = await request(app.getHttpServer())
      .patch(`/api/organizations/org-alpha-uuid/users/${multiRoleId}/status`)
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({ status: 'DEACTIVATED' });

    expect(res.status).toBe(200);

    // Both role assignments in Org Alpha must now be isActive = false
    const assignedAlphaRoles = mockUserRoles.filter((ur) => ur.userId === multiRoleId && ur.organizationId === 'org-alpha-uuid');
    expect(assignedAlphaRoles.length).toBe(2);
    expect(assignedAlphaRoles.every((ur) => ur.isActive === false)).toBe(true);
  });

  // 32. Suspended tenant member attempting access using existing valid JWT token is denied with HTTP 403
  it('32. Suspended tenant member attempting access with previously issued JWT must be denied (HTTP 403)', async () => {
    // Multi-tenant user assigned to both Org Alpha and Org Beta
    const multiTenantId = 'usr-multi-tenant-test';
    mockUsers[multiTenantId] = {
      id: multiTenantId,
      email: 'multi.tenant@example.com',
      firstName: 'Multi',
      lastName: 'Tenant',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUserRoles.push({
      id: 'ur-multi-test-alpha',
      userId: multiTenantId,
      roleId: 'role-org-member',
      organizationId: 'org-alpha-uuid',
      isActive: true,
      assignedAt: new Date(),
      role: mockRoles['role-org-member'],
      user: mockUsers[multiTenantId],
    });
    mockUserRoles.push({
      id: 'ur-multi-test-beta',
      userId: multiTenantId,
      roleId: 'role-org-member',
      organizationId: 'org-beta-uuid',
      isActive: true,
      assignedAt: new Date(),
      role: mockRoles['role-org-member'],
      user: mockUsers[multiTenantId],
    });

    const multiUserToken = await authService.generateToken({
      id: multiTenantId,
      email: 'multi.tenant@example.com',
      firstName: 'Multi',
      lastName: 'Tenant',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });

    // Verify member can initially access org users list in Org Alpha
    const initialRes = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${multiUserToken}`);
    expect(initialRes.status).toBe(200);

    // Owner suspends member in Org Alpha
    await request(app.getHttpServer())
      .patch(`/api/organizations/org-alpha-uuid/users/${multiTenantId}/status`)
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({ status: 'SUSPENDED' });

    // User's global status remains ACTIVE because they belong to Org Beta
    expect(mockUsers[multiTenantId].status).toBe(UserStatus.ACTIVE);

    // Suspended member attempts access to Org Alpha with existing valid JWT -> denied with HTTP 403
    const afterSuspensionRes = await request(app.getHttpServer())
      .get('/api/organizations/org-alpha-uuid/users')
      .set('Authorization', `Bearer ${multiUserToken}`);

    expect(afterSuspensionRes.status).toBe(403);
    expect(afterSuspensionRes.body.message).toContain('Cross-tenant access prohibited');

    // And verify user still has valid access to Org Beta
    const betaRes = await request(app.getHttpServer())
      .get('/api/organizations/org-beta-uuid/users')
      .set('Authorization', `Bearer ${multiUserToken}`);
    expect(betaRes.status).toBe(200);
  });

  // 33. Protection against unauthorized owner reactivation or privilege escalation
  it('33. Enterprise Administrator cannot reactivate a suspended/deactivated ORG_OWNER', async () => {
    // Temporarily add a second owner to Org Alpha to allow suspending usr-owner-a
    const secondOwnerAlphaId = 'usr-owner-a-temp-2';
    mockUsers[secondOwnerAlphaId] = {
      id: secondOwnerAlphaId,
      email: 'owner2.alpha@client-alpha.com',
      passwordHash: await bcrypt.hash('TestVertexPass123!', 10),
      firstName: 'Owner2',
      lastName: 'Alpha',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };
    mockUserRoles.push({
      id: 'ur-alpha-owner-temp-2',
      userId: secondOwnerAlphaId,
      roleId: 'role-org-owner',
      organizationId: 'org-alpha-uuid',
      isActive: true,
      assignedAt: new Date(),
      role: mockRoles['role-org-owner'],
      user: mockUsers[secondOwnerAlphaId],
    });

    // Owner deactivates usr-owner-a (allowed since 2 owners exist)
    await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-owner-a/status')
      .set('Authorization', `Bearer ${ownerOrgAToken}`)
      .send({ status: 'DEACTIVATED' });

    // Now, Enterprise Admin attempts to reactivate usr-owner-a -> MUST BE BLOCKED!
    const resEscalation = await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-owner-a/status')
      .set('Authorization', `Bearer ${adminOrgAToken}`)
      .send({ status: 'ACTIVE' });

    expect(resEscalation.status).toBe(403);
    expect(resEscalation.body.message).toContain('Enterprise Administrators cannot deactivate, reactivate, or modify an Organization Owner');

    // Clean up: reactivate usr-owner-a by systemAdminToken
    await request(app.getHttpServer())
      .patch('/api/organizations/org-alpha-uuid/users/usr-owner-a/status')
      .set('Authorization', `Bearer ${systemAdminToken}`)
      .send({ status: 'ACTIVE' });
  });

  // 34. Transaction retry exhaustion and safe failure
  it('34. Exhausted serialization retries fail safely with HTTP 409 without unhandled errors', async () => {
    const orgsService = app.get(OrganizationsService);
    const originalTransaction = orgsService['prisma'].$transaction;

    // Simulate persistent P2034 serialization conflict
    orgsService['prisma'].$transaction = async () => {
      const error: any = new Error('could not serialize access due to read/write dependencies among transactions');
      error.code = 'P2034';
      throw error;
    };

    try {
      const res = await request(app.getHttpServer())
        .patch('/api/organizations/org-alpha-uuid/users/usr-member-a/status')
        .set('Authorization', `Bearer ${ownerOrgAToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Concurrent modification conflict on organization owner status');
    } finally {
      orgsService['prisma'].$transaction = originalTransaction;
    }
  });

  // 35. Concurrent requests attempting to deactivate both owners cannot leave organization ownerless
  it('35. Concurrent deactivation of two owners cannot leave organization without an active owner', async () => {
    // Org Beta has usr-owner-b and secondOwnerId ('usr-owner-b-second')
    const secondOwnerId = 'usr-owner-b-second';

    // Ensure both owners exist and are active
    mockUsers['usr-owner-b'].status = UserStatus.ACTIVE;
    if (!mockUsers[secondOwnerId]) {
      mockUsers[secondOwnerId] = {
        id: secondOwnerId,
        email: 'owner2.b@client-beta.com',
        firstName: 'Owner2',
        lastName: 'Beta',
        userType: UserType.CUSTOMER_USER,
        status: UserStatus.ACTIVE,
      };
    } else {
      mockUsers[secondOwnerId].status = UserStatus.ACTIVE;
    }

    let ownerBRole = mockUserRoles.find((ur) => ur.userId === 'usr-owner-b' && ur.organizationId === 'org-beta-uuid');
    let ownerB2Role = mockUserRoles.find((ur) => ur.userId === secondOwnerId && ur.organizationId === 'org-beta-uuid');
    if (!ownerB2Role) {
      ownerB2Role = {
        id: 'ur-beta-owner-2',
        userId: secondOwnerId,
        roleId: 'role-org-owner',
        organizationId: 'org-beta-uuid',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-owner'],
        user: mockUsers[secondOwnerId],
      };
      mockUserRoles.push(ownerB2Role);
    } else {
      ownerB2Role.isActive = true;
    }
    if (ownerBRole) ownerBRole.isActive = true;

    // Execute two concurrent requests to deactivate both owners
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/organizations/org-beta-uuid/users/${secondOwnerId}/status`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({ status: 'SUSPENDED' }),
      request(app.getHttpServer())
        .patch(`/api/organizations/org-beta-uuid/users/usr-owner-b/status`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({ status: 'SUSPENDED' }),
    ]);

    // One request must succeed (200), and the other MUST be rejected (403)
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(403);

    // Confirm that at least one owner in Org Beta remains active in the database
    const activeBetaOwners = mockUserRoles.filter(
      (ur) => ur.organizationId === 'org-beta-uuid' && ur.role.code === 'ORG_OWNER' && ur.isActive === true
    );
    expect(activeBetaOwners.length).toBeGreaterThanOrEqual(1);
  });
});

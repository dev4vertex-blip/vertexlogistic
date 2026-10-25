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
import { RoleScope } from '@prisma/client';

describe('VERTEX Logistics API - Authentication & Authorization Integration Tests (STEP 2.6)', () => {
  let app: INestApplication;
  let authService: AuthService;

  // In-memory test store mocking the database layer for testing without a live PostgreSQL instance
  const testPasswordPlain = 'SecureVertexPass123!';
  let testPasswordHash: string;

  const mockUsers: Record<string, any> = {};
  const mockUserRoles: Record<string, any[]> = {};

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.JWT_SECRET = 'vertex-test-secret-key-32-chars-long!';

    testPasswordHash = await bcrypt.hash(testPasswordPlain, 10);

    // Seed test mock user fixtures
    mockUsers['active.customer@vertex.com'] = {
      id: 'usr-customer-001',
      email: 'active.customer@vertex.com',
      passwordHash: testPasswordHash,
      firstName: 'Customer',
      lastName: 'User',
      userType: 'CUSTOMER_USER',
      status: 'ACTIVE',
    };

    mockUsers['internal.admin@vertex.com'] = {
      id: 'usr-internal-001',
      email: 'internal.admin@vertex.com',
      passwordHash: testPasswordHash,
      firstName: 'Admin',
      lastName: 'Staff',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
    };

    mockUsers['suspended.user@vertex.com'] = {
      id: 'usr-suspended-001',
      email: 'suspended.user@vertex.com',
      passwordHash: testPasswordHash,
      firstName: 'Suspended',
      lastName: 'User',
      userType: 'CUSTOMER_USER',
      status: 'SUSPENDED',
    };

    mockUsers['pending.user@vertex.com'] = {
      id: 'usr-pending-001',
      email: 'pending.user@vertex.com',
      passwordHash: testPasswordHash,
      firstName: 'Pending',
      lastName: 'User',
      userType: 'CUSTOMER_USER',
      status: 'PENDING_VERIFICATION',
    };

    mockUsers['deactivated.user@vertex.com'] = {
      id: 'usr-deactivated-001',
      email: 'deactivated.user@vertex.com',
      passwordHash: testPasswordHash,
      firstName: 'Deactivated',
      lastName: 'User',
      userType: 'CUSTOMER_USER',
      status: 'DEACTIVATED',
    };

    // User Roles Fixtures
    mockUserRoles['usr-customer-001'] = [
      {
        roleScope: RoleScope.ORGANIZATION,
        organizationId: 'org-client-alpha',
        isActive: true,
        permissions: ['shipment:create', 'shipment:read', 'org:access'],
      },
    ];

    mockUserRoles['usr-internal-001'] = [
      {
        roleScope: RoleScope.SYSTEM_INTERNAL,
        organizationId: null,
        isActive: true,
        permissions: ['*'],
      },
    ];

    const mockPrismaService = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) {
            return mockUsers[where.email] || null;
          }
          if (where.id) {
            return Object.values(mockUsers).find((u) => u.id === where.id) || null;
          }
          return null;
        },
      },
      userRole: {
        findMany: async () => [],
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

    // Override getUserRoles to use our test fixtures
    authService.getUserRoles = async (userId: string) => {
      return mockUserRoles[userId] || [];
    };
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // 1. Valid Login
  it('1. POST /api/auth/login with valid credentials should return HTTP 200 and JWT token', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'Active.Customer@Vertex.com ', // Tests normalization (trim, lowercase)
      password: testPasswordPlain,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('tokenType', 'Bearer');
    expect(res.body).toHaveProperty('expiresIn');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toEqual({
      id: 'usr-customer-001',
      email: 'active.customer@vertex.com',
      firstName: 'Customer',
      lastName: 'User',
      userType: 'CUSTOMER_USER',
      status: 'ACTIVE',
    });

    // Zero secret leakage in response
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  // 2. Generic Error for Invalid Password (prevents account enumeration)
  it('2. POST /api/auth/login with invalid password should return generic 401 error', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: 'WrongPassword123!',
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid email or password.');
  });

  // 3. Generic Error for Non-Existent User
  it('3. POST /api/auth/login with non-existent email should return exact same generic 401 error', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'does-not-exist@vertex.com',
      password: 'SomeRandomPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid email or password.');
  });

  // 4. Generic Error for Suspended Account (prevents status disclosure)
  it('4. POST /api/auth/login should return identical generic 401 error for SUSPENDED accounts', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'suspended.user@vertex.com',
      password: testPasswordPlain,
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid email or password.');
  });

  // 5. Generic Error for Deactivated Account (prevents status disclosure)
  it('5. POST /api/auth/login should return identical generic 401 error for DEACTIVATED accounts', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'deactivated.user@vertex.com',
      password: testPasswordPlain,
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid email or password.');
  });

  // 6. Generic Error for Pending Verification Account (prevents status disclosure)
  it('6. POST /api/auth/login should return identical generic 401 error for PENDING_VERIFICATION accounts', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'pending.user@vertex.com',
      password: testPasswordPlain,
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid email or password.');
  });

  // 7. Comprehensive Account Enumeration Prevention: All failure modes yield indistinguishable responses
  it('7. All login failure modes must produce identical HTTP 401 status and body preventing account enumeration', async () => {
    const scenarios = [
      { name: 'Unknown Email', payload: { email: 'nonexistent@vertex.com', password: testPasswordPlain } },
      { name: 'Wrong Password', payload: { email: 'active.customer@vertex.com', password: 'BadPassword!' } },
      { name: 'Suspended User', payload: { email: 'suspended.user@vertex.com', password: testPasswordPlain } },
      { name: 'Deactivated User', payload: { email: 'deactivated.user@vertex.com', password: testPasswordPlain } },
      { name: 'Pending User', payload: { email: 'pending.user@vertex.com', password: testPasswordPlain } },
    ];

    const responses = await Promise.all(
      scenarios.map((s) => request(app.getHttpServer()).post('/api/auth/login').send(s.payload)),
    );

    for (let i = 0; i < responses.length; i++) {
      expect(responses[i]!.status).toBe(401);
      expect(responses[i]!.body.message).toBe('Invalid email or password.');
      expect(responses[i]!.body.error).toBe('Unauthorized');
    }
  });

  // 8. Missing Authorization Header on Protected Route
  it('8. GET /api/auth/me without Bearer token should return HTTP 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Missing authorization header');
  });

  // 9. Malformed Authorization Header
  it('9. GET /api/auth/me with malformed header should return HTTP 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Basic invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid authorization format');
  });

  // 10. Access Protected Route with Valid Token
  it('10. GET /api/auth/me with valid Bearer token should return user identity', async () => {
    // Generate valid token for customer user
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });

    const token = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('sub', 'usr-customer-001');
    expect(res.body.user).toHaveProperty('email', 'active.customer@vertex.com');
  });

  // 11. Cross-Boundary Violation: Customer User attempting to access System Internal Role route
  it('11. GET /api/auth/test/internal-only should deny CUSTOMER_USER with HTTP 403', async () => {
    const customerLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });

    const res = await request(app.getHttpServer())
      .get('/api/auth/test/internal-only')
      .set('Authorization', `Bearer ${customerLogin.body.accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cross-boundary violation');
  });

  // 12. Internal Admin Allowed on System Internal Route
  it('12. GET /api/auth/test/internal-only should allow INTERNAL_EMPLOYEE with SUPER_ADMIN role', async () => {
    const adminLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'internal.admin@vertex.com',
      password: testPasswordPlain,
    });

    const res = await request(app.getHttpServer())
      .get('/api/auth/test/internal-only')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Access granted to internal administrator');
  });

  // 13. Missing Organization Context on Tenant-Protected Route
  it('13. GET /api/auth/test/tenant-resource without X-Organization-ID should return HTTP 400', async () => {
    const customerLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });

    const res = await request(app.getHttpServer())
      .get('/api/auth/test/tenant-resource')
      .set('Authorization', `Bearer ${customerLogin.body.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Organization context required via X-Organization-ID header');
  });

  // 14. Cross-Tenant Access Denial: Customer accessing another organization's tenant resource
  it('14. GET /api/auth/test/tenant-resource with unauthorized organization should return HTTP 403', async () => {
    const customerLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });

    // User is authorized for 'org-client-alpha', but sends 'org-client-beta'
    const res = await request(app.getHttpServer())
      .get('/api/auth/test/tenant-resource')
      .set('Authorization', `Bearer ${customerLogin.body.accessToken}`)
      .set('X-Organization-ID', 'org-client-beta');

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Cross-tenant access prohibited');
  });

  // 15. Authorized Tenant Access: Customer accessing their own organization's resource
  it('15. GET /api/auth/test/tenant-resource with authorized organization should return HTTP 200', async () => {
    const customerLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });

    const res = await request(app.getHttpServer())
      .get('/api/auth/test/tenant-resource')
      .set('Authorization', `Bearer ${customerLogin.body.accessToken}`)
      .set('X-Organization-ID', 'org-client-alpha');

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Access granted to tenant resource');
    expect(res.body.organizationId).toBe('org-client-alpha');
  });

  // 16. Zero Secret Leakage Verification
  it('16. Authentication endpoints must never expose secrets, jwtSecret, or raw hashes in responses', async () => {
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });

    const rawResponse = JSON.stringify(loginRes.body);
    expect(rawResponse).not.toContain(process.env.JWT_SECRET!);
    expect(rawResponse).not.toContain(testPasswordHash);
    expect(rawResponse).not.toContain('passwordHash');
    expect(rawResponse).not.toContain('secret');
  });

  // 17. Stale Token Rejection after User Suspension in Database
  it('17. Previously issued valid JWT must be rejected if user account is suspended in the database', async () => {
    // A. Issue token when user is active
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });
    const validToken = loginRes.body.accessToken;

    // Verify token works while ACTIVE
    const initialRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(initialRes.status).toBe(200);

    // B. Admin suspends user in database
    mockUsers['active.customer@vertex.com'].status = 'SUSPENDED';

    try {
      // User attempts to use stale token with old claim
      const suspendedRes = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(suspendedRes.status).toBe(401);
      expect(suspendedRes.body.message).toContain('User account is suspended, deactivated, or no longer active');
    } finally {
      // Restore user status for subsequent tests
      mockUsers['active.customer@vertex.com'].status = 'ACTIVE';
    }
  });

  // 18. Expired JWT Rejection
  it('18. Expired JWT must return HTTP 401', async () => {
    // Generate immediately expired token
    const jwt = await import('jsonwebtoken');
    const expiredToken = jwt.default.sign(
      { sub: 'usr-customer-001', email: 'active.customer@vertex.com', status: 'ACTIVE' },
      process.env.JWT_SECRET!,
      {
        expiresIn: 0,
        issuer: 'vertex-logistics',
        audience: 'vertex-api',
      },
    );

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid or expired authentication token');
  });

  // 19. Forged Signature / Tampered Secret Token Rejection
  it('19. Token signed with wrong secret or forged signature must return HTTP 401', async () => {
    const jwtService = app.get(AuthService)['jwtService'];
    const forgedToken = await jwtService.signAsync(
      { sub: 'usr-customer-001', email: 'active.customer@vertex.com', status: 'ACTIVE' },
      {
        secret: 'attacker-forged-secret-key-32-chars!',
        issuer: 'vertex-logistics',
        audience: 'vertex-api',
      },
    );

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid or expired authentication token');
  });

  // 20. Database Authorization Lookup Failure Fails Closed
  it('20. Database lookup failure during tenant authorization must fail closed with HTTP 403', async () => {
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'active.customer@vertex.com',
      password: testPasswordPlain,
    });
    const token = loginRes.body.accessToken;

    // Temporarily simulate database crash on getUserRoles
    const originalGetUserRoles = authService.getUserRoles;
    authService.getUserRoles = async () => {
      throw new Error('Database connection terminated unexpectedly');
    };

    try {
      const res = await request(app.getHttpServer())
        .get('/api/auth/test/tenant-resource')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-ID', 'org-client-alpha');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Authorization lookup failed. Denying access (fail-closed)');
    } finally {
      authService.getUserRoles = originalGetUserRoles;
    }
  });
});


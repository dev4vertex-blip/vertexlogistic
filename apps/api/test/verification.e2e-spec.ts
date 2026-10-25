import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaService } from '@vertex/database';
import { AuthService } from '../src/auth/auth.service.js';
import { EmailService } from '../src/email/email.service.js';
import { EMAIL_PROVIDER } from '../src/email/email.interfaces.js';
import { MockEmailProvider } from '../src/email/providers/mock-email.provider.js';
import { UserStatus, UserType, RoleScope, OrganizationType, OrganizationStatus } from '@prisma/client';

describe('VERTEX Logistics API - User Invitation & Email Verification (STEP 2.8)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let emailService: EmailService;
  let mockEmailProvider: MockEmailProvider;

  let ownerToken: string;
  let regularMemberToken: string;

  // In-memory database mock
  const mockUsers: Record<string, any> = {};
  const mockOrgs: Record<string, any> = {};
  const mockRoles: Record<string, any> = {};
  let mockUserRoles: any[] = [];
  let mockVerificationTokens: any[] = [];
  let simulateTransientP2034 = 0;
  let simulateTransientP2002 = 0;
  let simulateUnrecoverableTxFailure = false;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
    process.env.JWT_SECRET = 'vertex-test-secret-key-32-chars-long!';

    mockEmailProvider = new MockEmailProvider();

    // 1. Seed Roles
    mockRoles['role-org-owner'] = {
      id: 'role-org-owner',
      code: 'ORG_OWNER',
      name: 'Organization Owner',
      scope: RoleScope.ORGANIZATION,
    };
    mockRoles['role-org-member'] = {
      id: 'role-org-member',
      code: 'ENTERPRISE_MEMBER',
      name: 'Enterprise Member',
      scope: RoleScope.ORGANIZATION,
    };

    // 2. Seed Organization
    mockOrgs['org-vertex-client'] = {
      id: 'org-vertex-client',
      name: 'Vertex Prime Logistics',
      code: 'ORG-VPL-001',
      type: OrganizationType.ENTERPRISE_CLIENT,
      status: OrganizationStatus.ACTIVE,
      gstin: '27AABCV1234D1Z5',
      pan: 'AABCV1234D',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockOrgs['org-vertex-client-2'] = {
      id: 'org-vertex-client-2',
      name: 'Vertex Secondary Carrier',
      code: 'ORG-VSC-002',
      type: OrganizationType.LOGISTICS_PARTNER,
      status: OrganizationStatus.ACTIVE,
      gstin: '29AABCV5678E1Z9',
      pan: 'AABCV5678E',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 3. Seed Users
    const passwordHash = await bcrypt.hash('TestVertexPass123!', 10);

    mockUsers['usr-owner'] = {
      id: 'usr-owner',
      email: 'owner@vertex-client.com',
      passwordHash,
      firstName: 'Alice',
      lastName: 'Owner',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };

    mockUsers['usr-member'] = {
      id: 'usr-member',
      email: 'member@vertex-client.com',
      passwordHash,
      firstName: 'Bob',
      lastName: 'Member',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    };

    mockUsers['usr-deactivated'] = {
      id: 'usr-deactivated',
      email: 'deactivated@vertex-client.com',
      passwordHash,
      firstName: 'David',
      lastName: 'Deactivated',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.DEACTIVATED,
    };

    mockUsers['usr-suspended'] = {
      id: 'usr-suspended',
      email: 'suspended@vertex-client.com',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Suspended',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.SUSPENDED,
    };

    mockUserRoles = [
      {
        id: 'ur-owner',
        userId: 'usr-owner',
        roleId: 'role-org-owner',
        organizationId: 'org-vertex-client',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-owner'],
        user: mockUsers['usr-owner'],
      },
      {
        id: 'ur-owner-2',
        userId: 'usr-owner',
        roleId: 'role-org-owner',
        organizationId: 'org-vertex-client-2',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-owner'],
        user: mockUsers['usr-owner'],
      },
      {
        id: 'ur-member',
        userId: 'usr-member',
        roleId: 'role-org-member',
        organizationId: 'org-vertex-client',
        isActive: true,
        assignedAt: new Date(),
        role: mockRoles['role-org-member'],
        user: mockUsers['usr-member'],
      },
    ];

    const mockPrismaService = {
      organization: {
        findUnique: async ({ where }: { where: { id?: string; code?: string } }) => {
          if (where.id) return mockOrgs[where.id] || null;
          if (where.code) {
            return Object.values(mockOrgs).find((o: any) => o.code === where.code) || null;
          }
          return null;
        },
      },
      user: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return mockUsers[where.id] || null;
          if (where.email) return mockUsers[where.email] || null;
          return null;
        },
        create: async ({ data }: { data: any }) => {
          const id = `usr-${Date.now()}-${Math.random()}`;
          const newUser = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          mockUsers[id] = newUser;
          mockUsers[data.email] = newUser;
          return newUser;
        },
        update: async ({ where, data }: { where: { id: string }; data: any }) => {
          const user = mockUsers[where.id];
          if (!user) throw new Error('User not found');
          Object.assign(user, data, { updatedAt: new Date() });
          return user;
        },
      },
      role: {
        findUnique: async ({ where }: { where: { code?: string; id?: string } }) => {
          if (where.id) return mockRoles[where.id] || null;
          if (where.code) {
            return Object.values(mockRoles).find((r: any) => r.code === where.code) || null;
          }
          return null;
        },
        findFirst: async ({ where }: { where: { id?: string; code?: string; scope?: RoleScope } }) => {
          return (
            Object.values(mockRoles).find((r: any) => {
              if (where.id && r.id !== where.id) return false;
              if (where.code && r.code !== where.code) return false;
              if (where.scope && r.scope !== where.scope) return false;
              return true;
            }) || null
          );
        },
      },
      userRole: {
        findFirst: async ({ where }: { where: any }) => {
          return (
            mockUserRoles.find((ur) => {
              if (where.userId && ur.userId !== where.userId) return false;
              if (where.organizationId && ur.organizationId !== where.organizationId) return false;
              if (where.roleId && ur.roleId !== where.roleId) return false;
              if (where.isActive !== undefined && ur.isActive !== where.isActive) return false;
              return true;
            }) || null
          );
        },
        findMany: async ({ where }: { where: any }) => {
          return mockUserRoles.filter((ur) => {
            if (where.userId && ur.userId !== where.userId) return false;
            if (where.organizationId && ur.organizationId !== where.organizationId) return false;
            if (where.isActive !== undefined && ur.isActive !== where.isActive) return false;
            return true;
          });
        },
        create: async ({ data }: { data: any }) => {
          const id = `ur-${Date.now()}-${Math.random()}`;
          const created = {
            id,
            ...data,
            assignedAt: new Date(),
            role: mockRoles[data.roleId] || { id: data.roleId, code: 'UNKNOWN' },
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
        findUnique: async ({ where }: { where: { tokenHash?: string } }) => {
          const found = mockVerificationTokens.find((vt) => vt.tokenHash === where.tokenHash);
          if (!found) return null;
          return {
            ...found,
            user: mockUsers[found.userId] || null,
          };
        },
        findFirst: async ({ where }: { where: any }) => {
          return (
            mockVerificationTokens
              .slice()
              .reverse()
              .find((vt) => {
                if (where.userId && vt.userId !== where.userId) return false;
                if (where.consumedAt === null && (vt.consumedAt !== null && vt.consumedAt !== undefined)) return false;
                if (where.revokedAt === null && (vt.revokedAt !== null && vt.revokedAt !== undefined)) return false;
                return true;
              }) || null
          );
        },
        create: async ({ data }: { data: any }) => {
          // Emulate PostgreSQL partial unique index enforcement:
          // 1. unique_active_org_invitation: (userId, organizationId) WHERE type = 'ORGANIZATION_INVITATION' AND consumedAt IS NULL AND revokedAt IS NULL
          if (data.type === 'ORGANIZATION_INVITATION' && data.organizationId && !data.consumedAt && !data.revokedAt) {
            const conflict = mockVerificationTokens.find(
              (vt) =>
                vt.userId === data.userId &&
                vt.organizationId === data.organizationId &&
                vt.type === 'ORGANIZATION_INVITATION' &&
                !vt.consumedAt &&
                !vt.revokedAt,
            );
            if (conflict) {
              const p2002Err: any = new Error('Unique constraint failed on the fields: (`user_id`, `organization_id`)');
              p2002Err.code = 'P2002';
              throw p2002Err;
            }
          }
          // 2. unique_active_email_verification: (userId) WHERE type = 'EMAIL_VERIFICATION' AND consumedAt IS NULL AND revokedAt IS NULL
          if (data.type === 'EMAIL_VERIFICATION' && !data.consumedAt && !data.revokedAt) {
            const conflict = mockVerificationTokens.find(
              (vt) =>
                vt.userId === data.userId &&
                vt.type === 'EMAIL_VERIFICATION' &&
                !vt.consumedAt &&
                !vt.revokedAt,
            );
            if (conflict) {
              const p2002Err: any = new Error('Unique constraint failed on the fields: (`user_id`)');
              p2002Err.code = 'P2002';
              throw p2002Err;
            }
          }

          const id = `vt-${Date.now()}-${Math.random()}`;
          const created = { id, ...data, createdAt: new Date() };
          mockVerificationTokens.push(created);
          return created;
        },
        updateMany: async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const vt of mockVerificationTokens) {
            if (where.id && vt.id !== where.id) continue;
            if (where.userId && vt.userId !== where.userId) continue;
            if (where.organizationId && vt.organizationId !== where.organizationId) continue;
            if (where.consumedAt === null && vt.consumedAt !== null && vt.consumedAt !== undefined) continue;
            if (where.revokedAt === null && vt.revokedAt !== null && vt.revokedAt !== undefined) continue;
            if (where.expiresAt?.gt && vt.expiresAt <= where.expiresAt.gt) continue;
            Object.assign(vt, data);
            count++;
          }
          return { count };
        },
      },
      $transaction: async (fn: (tx: any) => Promise<any>, options?: any) => {
        if (simulateUnrecoverableTxFailure) {
          throw new Error('Database transaction connection error');
        }
        if (simulateTransientP2034 > 0) {
          simulateTransientP2034--;
          const p2034Err: any = new Error('Transaction failed due to a write conflict or deadlock (P2034)');
          p2034Err.code = 'P2034';
          throw p2034Err;
        }
        if (simulateTransientP2002 > 0) {
          simulateTransientP2002--;
          const p2002Err: any = new Error('Unique constraint failed on the fields: (`user_id`, `organization_id`)');
          p2002Err.code = 'P2002';
          throw p2002Err;
        }
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
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(mockEmailProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    emailService = moduleFixture.get<EmailService>(EmailService);

    ownerToken = await authService.generateToken({
      id: 'usr-owner',
      email: 'owner@vertex-client.com',
      firstName: 'Alice',
      lastName: 'Owner',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });

    regularMemberToken = await authService.generateToken({
      id: 'usr-member',
      email: 'member@vertex-client.com',
      firstName: 'Bob',
      lastName: 'Member',
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.ACTIVE,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // 1. Successful User Invitation generates token hash, dispatches mock email, and returns sanitized response
  it('1. POST /api/organizations/:id/users creates pending user, hashes token, and sends invitation email without leaking raw token', async () => {
    mockEmailProvider.clearSentEmails();

    const inviteRes = await request(app.getHttpServer())
      .post('/api/organizations/org-vertex-client/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'new.candidate@client.com',
        firstName: 'Charlie',
        lastName: 'Candidate',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.status).toBe('PENDING_VERIFICATION');

    // Zero secret leakage in API response: no token or passwordHash returned
    expect(inviteRes.body).not.toHaveProperty('token');
    expect(inviteRes.body).not.toHaveProperty('tokenHash');
    expect(inviteRes.body).not.toHaveProperty('rawToken');
    expect(inviteRes.body).not.toHaveProperty('passwordHash');

    // Verify token was hashed before storing in database
    const tokenRecord = mockVerificationTokens.find(
      (vt) => vt.userId === inviteRes.body.userId && vt.organizationId === 'org-vertex-client',
    );
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord.tokenHash).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256 hex string
    expect(tokenRecord.consumedAt).toBeUndefined();
    expect(tokenRecord.revokedAt).toBeUndefined();
    expect(new Date(tokenRecord.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Verify deterministic email dispatch was captured by mock provider
    const sent = mockEmailProvider.getLastSentEmail();
    expect(sent).toBeDefined();
    expect(sent?.to).toBe('new.candidate@client.com');
    expect(sent?.subject).toContain('Invitation to join Vertex Prime Logistics');
    expect(sent?.text).toContain('Verification Token:');
  });

  // 2. Pending account cannot log in before verification
  it('2. POST /api/auth/login for PENDING_VERIFICATION user is rejected with generic 401', async () => {
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'new.candidate@client.com',
      password: 'AnyPassword123!',
    });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.message).toBe('Invalid email or password.');
  });

  // 3. Successful account verification with password setup activates the account
  it('3. POST /api/auth/verify-email with valid token and password activates user', async () => {
    // Extract raw token from the dispatched mock email
    const sentEmail = mockEmailProvider.getLastSentEmail();
    const tokenMatch = sentEmail?.text?.match(/Verification Token:\s*([a-f0-9]+)/);
    expect(tokenMatch).toBeTruthy();
    const rawToken = tokenMatch![1]!;

    const newPassword = 'NewlyActivatedPass123!';

    const verifyRes = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: rawToken,
        password: newPassword,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.message).toContain('Email successfully verified and account activated');
    expect(verifyRes.body.user.status).toBe('ACTIVE');

    // Confirm token in database is now marked consumed
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenRecord = mockVerificationTokens.find((vt) => vt.tokenHash === tokenHash);
    expect(tokenRecord.consumedAt).toBeDefined();

    // Confirm user is now ACTIVE and can log in with new password
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'new.candidate@client.com',
      password: newPassword,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.status).toBe('ACTIVE');
  });

  // 4. Token single-use consumption: Attempting to reuse already-consumed token is rejected
  it('4. POST /api/auth/verify-email with already consumed token returns HTTP 400', async () => {
    const sentEmail = mockEmailProvider.getLastSentEmail();
    const tokenMatch = sentEmail?.text?.match(/Verification Token:\s*([a-f0-9]+)/);
    expect(tokenMatch).toBeTruthy();
    const rawToken = tokenMatch![1]!;

    const reuseRes = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: rawToken,
      });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.message).toContain('Verification token has already been consumed');
  });

  // 5. Expired token rejection
  it('5. POST /api/auth/verify-email with expired token returns HTTP 400', async () => {
    // Manually insert an expired token
    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');

    mockVerificationTokens.push({
      id: 'vt-expired-test',
      userId: 'usr-owner',
      tokenHash: expiredHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      createdAt: new Date(Date.now() - 7200 * 1000),
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: expiredRawToken,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Verification token has expired');
  });

  // 6. Revoked token rejection
  it('6. POST /api/auth/verify-email with revoked token returns HTTP 400', async () => {
    const revokedRawToken = crypto.randomBytes(32).toString('hex');
    const revokedHash = crypto.createHash('sha256').update(revokedRawToken).digest('hex');

    mockVerificationTokens.push({
      id: 'vt-revoked-test',
      userId: 'usr-owner',
      tokenHash: revokedHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      revokedAt: new Date(), // Revoked
      createdAt: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: revokedRawToken,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Verification token has been revoked');
  });

  // 7. Invalid/Unknown token rejection
  it('7. POST /api/auth/verify-email with completely unknown token returns HTTP 400', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex');

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: fakeToken,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid or expired verification token');
  });

  // 8. Malformed token input validation
  it('8. POST /api/auth/verify-email with malformed/empty token returns HTTP 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Verification token format is invalid');
  });

  // 9. Weak password validation on verification
  it('9. POST /api/auth/verify-email with weak password returns HTTP 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: crypto.randomBytes(32).toString('hex'),
        password: 'weak',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Password must be at least 8 characters long');
  });

  // 10. Resend verification for unverified account revokes prior tokens and dispatches new email
  it('10. POST /api/auth/resend-verification revokes active tokens and sends fresh verification email', async () => {
    // Create an unverified user
    const pendingEmail = 'unverified.resend@client.com';
    const pendingUser = {
      id: 'usr-pending-resend',
      email: pendingEmail,
      firstName: 'Penny',
      lastName: 'Pending',
      passwordHash: await bcrypt.hash('Placeholder123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[pendingUser.id] = pendingUser;
    mockUsers[pendingEmail] = pendingUser;

    // Issue initial token
    const oldRawToken = crypto.randomBytes(32).toString('hex');
    const oldHash = crypto.createHash('sha256').update(oldRawToken).digest('hex');
    mockVerificationTokens.push({
      id: 'vt-old-token',
      userId: pendingUser.id,
      tokenHash: oldHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
    });

    mockEmailProvider.clearSentEmails();

    // Call resend verification
    const res = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: pendingEmail });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('If an unverified account exists for this email, a new verification link has been sent');

    // Confirm previous token was revoked
    const oldRecord = mockVerificationTokens.find((vt) => vt.id === 'vt-old-token');
    expect(oldRecord.revokedAt).toBeDefined();

    // Confirm new token exists and email was dispatched
    const sent = mockEmailProvider.getLastSentEmail();
    expect(sent).toBeDefined();
    expect(sent?.to).toBe(pendingEmail);
    expect(sent?.subject).toContain('Verify your email address');

    // Confirm old token can no longer be used
    const oldUseRes = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: oldRawToken });
    expect(oldUseRes.status).toBe(400);
    expect(oldUseRes.body.message).toContain('Verification token has been revoked');
  });

  // 11. Resend verification account enumeration prevention: non-existent email returns same generic message
  it('11. POST /api/auth/resend-verification for non-existent email returns generic message without dispatching email', async () => {
    mockEmailProvider.clearSentEmails();

    const res = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: 'ghost.user.does.not.exist@nowhere.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('If an unverified account exists for this email, a new verification link has been sent');

    // No email should be dispatched
    expect(mockEmailProvider.getSentEmails().length).toBe(0);
  });

  // 12. Resend verification for already ACTIVE user returns same generic message without re-inviting
  it('12. POST /api/auth/resend-verification for already ACTIVE account returns generic message without re-sending', async () => {
    mockEmailProvider.clearSentEmails();

    const res = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: 'owner@vertex-client.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('If an unverified account exists for this email, a new verification link has been sent');

    // No email should be dispatched
    expect(mockEmailProvider.getSentEmails().length).toBe(0);
  });

  // 13. Verification attempt for DEACTIVATED user is rejected
  it('13. POST /api/auth/verify-email for DEACTIVATED user account returns HTTP 400', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    mockVerificationTokens.push({
      id: 'vt-deactivated-user',
      userId: 'usr-deactivated',
      tokenHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: rawToken });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('User account has been deactivated');
  });

  // 14. Email delivery provider failure resilience
  it('14. Transient email delivery failure does not crash the invitation endpoint', async () => {
    mockEmailProvider.setSimulateFailure(true);

    try {
      const inviteRes = await request(app.getHttpServer())
        .post('/api/organizations/org-vertex-client/users')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: 'retry.recipient@client.com',
          firstName: 'Rita',
          lastName: 'Retry',
          roleCode: 'ENTERPRISE_MEMBER',
        });

      // User and token are created; invitation soft-fails email without 500 crash
      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.status).toBe('PENDING_VERIFICATION');
    } finally {
      mockEmailProvider.setSimulateFailure(false);
    }
  });

  // 15. Non-admin tenant member cannot invite users (HTTP 403)
  it('15. POST /api/organizations/:id/users by regular member returns HTTP 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/organizations/org-vertex-client/users')
      .set('Authorization', `Bearer ${regularMemberToken}`)
      .send({
        email: 'unauthorized.invite@client.com',
        firstName: 'Unauthorized',
        lastName: 'Invite',
        roleCode: 'ENTERPRISE_MEMBER',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Administrative authority required');
  });

  // 16. Password enrollment policy: verification of invited/pending user requires setting a password
  it('16. POST /api/auth/verify-email for invited account without password returns HTTP 400', async () => {
    // Generate an invitation token for a pending user
    const pendingRawToken = crypto.randomBytes(32).toString('hex');
    const pendingHash = crypto.createHash('sha256').update(pendingRawToken).digest('hex');

    const pendingUser = {
      id: 'usr-pending-no-pw',
      email: 'pending.nopassword@client.com',
      firstName: 'Ned',
      lastName: 'NoPass',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[pendingUser.id] = pendingUser;
    mockUsers[pendingUser.email] = pendingUser;

    mockVerificationTokens.push({
      id: 'vt-pending-no-pw',
      userId: pendingUser.id,
      organizationId: 'org-vertex-client',
      tokenHash: pendingHash,
      type: 'ORGANIZATION_INVITATION',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      createdAt: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: pendingRawToken,
        // no password provided!
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('password is required to activate an unverified account');

    // Confirm user status remains PENDING_VERIFICATION
    expect(mockUsers[pendingUser.id].status).toBe(UserStatus.PENDING_VERIFICATION);
  });

  // 17. Verification attempt for SUSPENDED user is rejected
  it('17. POST /api/auth/verify-email for SUSPENDED user account returns HTTP 400', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    mockVerificationTokens.push({
      id: 'vt-suspended-user',
      userId: 'usr-suspended',
      tokenHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: rawToken,
        password: 'SomeNewPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('User account has been suspended');
    expect(mockUsers['usr-suspended'].status).toBe(UserStatus.SUSPENDED);
  });

  // 18. Two simultaneous resend requests leave strictly one active token in database
  it('18. Two simultaneous resend requests execute safely and leave strictly 1 active token', async () => {
    const concurrentEmail = 'concurrent.resend@client.com';
    const concurrentUser = {
      id: 'usr-concurrent-resend',
      email: concurrentEmail,
      firstName: 'Connie',
      lastName: 'Current',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[concurrentUser.id] = concurrentUser;
    mockUsers[concurrentEmail] = concurrentUser;

    mockEmailProvider.clearSentEmails();

    // Trigger two simultaneous resend requests concurrently
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/resend-verification').send({ email: concurrentEmail }),
      request(app.getHttpServer()).post('/api/auth/resend-verification').send({ email: concurrentEmail }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Filter tokens for this user in database
    const userTokens = mockVerificationTokens.filter((vt) => vt.userId === concurrentUser.id);
    const activeTokens = userTokens.filter((vt) => vt.consumedAt == null && vt.revokedAt == null);

    // Invariant: At most 1 active token can exist simultaneously
    expect(activeTokens.length).toBe(1);
  });

  // 19. Verification racing with resend rejects the invalidated/revoked token
  it('19. Verification racing with resend rejects the revoked token (HTTP 400)', async () => {
    const raceEmail = 'race.verify@client.com';
    const raceUser = {
      id: 'usr-race-verify',
      email: raceEmail,
      firstName: 'Ray',
      lastName: 'Cing',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[raceUser.id] = raceUser;
    mockUsers[raceEmail] = raceUser;

    // Issue initial token
    const oldRaw = crypto.randomBytes(32).toString('hex');
    const oldHash = crypto.createHash('sha256').update(oldRaw).digest('hex');
    mockVerificationTokens.push({
      id: 'vt-race-old',
      userId: raceUser.id,
      tokenHash: oldHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
    });

    // Resend triggers revocation of the old token
    await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: raceEmail });

    // Attempting to consume the old token must fail
    const verifyRes = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: oldRaw,
        password: 'ValidPassword123!',
      });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.message).toContain('Verification token has been revoked');
  });

  // 20. Two concurrent verification attempts: exactly one succeeds and the other is rejected
  it('20. Two concurrent verification attempts: exactly one consumes the token and the other fails', async () => {
    const doubleVerifyEmail = 'double.verify@client.com';
    const doubleUser = {
      id: 'usr-double-verify',
      email: doubleVerifyEmail,
      firstName: 'Doug',
      lastName: 'Double',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[doubleUser.id] = doubleUser;
    mockUsers[doubleVerifyEmail] = doubleUser;

    const singleRaw = crypto.randomBytes(32).toString('hex');
    const singleHash = crypto.createHash('sha256').update(singleRaw).digest('hex');
    mockVerificationTokens.push({
      id: 'vt-single-token',
      userId: doubleUser.id,
      tokenHash: singleHash,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      createdAt: new Date(),
    });

    const [v1, v2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: singleRaw, password: 'StrongPassword123!' }),
      request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: singleRaw, password: 'StrongPassword123!' }),
    ]);

    const statuses = [v1.status, v2.status].sort();
    // One must succeed (200), and the other must fail (400 or 409)
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
  });

  // 21. Separate valid organization contexts: same user invited to Org 1 and Org 2 maintains separate active tokens
  it('21. Separate valid organization contexts: user invited to Org 1 and Org 2 maintains separate active tokens', async () => {
    mockEmailProvider.clearSentEmails();

    const multiTenantCandidateEmail = 'multi.tenant.candidate@client.com';

    // 1. Invite to Org 1
    const invite1 = await request(app.getHttpServer())
      .post('/api/organizations/org-vertex-client/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: multiTenantCandidateEmail,
        firstName: 'Multi',
        lastName: 'Tenant',
        roleCode: 'ENTERPRISE_MEMBER',
      });
    expect(invite1.status).toBe(201);

    // 2. Invite to Org 2
    const invite2 = await request(app.getHttpServer())
      .post('/api/organizations/org-vertex-client-2/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: multiTenantCandidateEmail,
        firstName: 'Multi',
        lastName: 'Tenant',
        roleCode: 'ENTERPRISE_MEMBER',
      });
    expect(invite2.status).toBe(201);

    const candidateId = invite1.body.userId;
    const candidateTokens = mockVerificationTokens.filter(
      (vt) => vt.userId === candidateId && vt.consumedAt == null && vt.revokedAt == null,
    );

    // Distinct tokens for each distinct organization context
    expect(candidateTokens.length).toBe(2);
    const orgIds = candidateTokens.map((vt) => vt.organizationId);
    expect(orgIds).toContain('org-vertex-client');
    expect(orgIds).toContain('org-vertex-client-2');
  });

  // 22. Concurrency retry handling for P2034 serialization conflict succeeds on bounded retry
  it('22. Resend verification recovers and succeeds on transient P2034 serialization conflict', async () => {
    const p2034Email = 'p2034.retry@client.com';
    const p2034User = {
      id: 'usr-p2034-retry',
      email: p2034Email,
      firstName: 'Perry',
      lastName: 'P2034',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[p2034User.id] = p2034User;
    mockUsers[p2034Email] = p2034User;

    // Configure test double to throw P2034 once then succeed on retry
    simulateTransientP2034 = 1;

    const res = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: p2034Email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const activeToken = mockVerificationTokens.find(
      (vt) => vt.userId === p2034User.id && vt.consumedAt == null && vt.revokedAt == null,
    );
    expect(activeToken).toBeDefined();
  });

  // 23. Concurrency retry handling for P2002 unique constraint conflict succeeds on bounded retry
  it('23. Resend verification recovers and succeeds on transient P2002 unique constraint conflict', async () => {
    const p2002Email = 'p2002.retry@client.com';
    const p2002User = {
      id: 'usr-p2002-retry',
      email: p2002Email,
      firstName: 'Pam',
      lastName: 'P2002',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[p2002User.id] = p2002User;
    mockUsers[p2002Email] = p2002User;

    // Configure test double to throw P2002 once then succeed on retry
    simulateTransientP2002 = 1;

    const res = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: p2002Email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const activeToken = mockVerificationTokens.find(
      (vt) => vt.userId === p2002User.id && vt.consumedAt == null && vt.revokedAt == null,
    );
    expect(activeToken).toBeDefined();
  });

  // 24. Transaction rollback on unrecoverable issuance error prevents token creation and email dispatch
  it('24. Transaction rollback on unrecoverable error suppresses email dispatch and preserves state', async () => {
    mockEmailProvider.clearSentEmails();

    const rollbackEmail = 'rollback.test@client.com';
    const rollbackUser = {
      id: 'usr-rollback-test',
      email: rollbackEmail,
      firstName: 'Roland',
      lastName: 'Rollback',
      passwordHash: await bcrypt.hash('PlaceholderSecret123!', 10),
      userType: UserType.CUSTOMER_USER,
      status: UserStatus.PENDING_VERIFICATION,
    };
    mockUsers[rollbackUser.id] = rollbackUser;
    mockUsers[rollbackEmail] = rollbackUser;

    simulateUnrecoverableTxFailure = true;

    try {
      const res = await request(app.getHttpServer())
        .post('/api/auth/resend-verification')
        .send({ email: rollbackEmail });

      // Returns generic message without throwing 500 error externally
      expect(res.status).toBe(200);

      // No email should have been dispatched because transaction failed
      expect(mockEmailProvider.getSentEmails().length).toBe(0);
    } finally {
      simulateUnrecoverableTxFailure = false;
    }
  });
});

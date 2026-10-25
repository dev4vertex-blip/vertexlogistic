import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '@vertex/database';
import type { UserRoleEvaluationItem } from '@vertex/database';
import { Prisma, RoleScope, UserStatus } from '@prisma/client';
import { getAppConfig } from '../config/env.config.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { EmailService } from '../email/email.service.js';
import type {
  LoginResponse,
  AuthUser,
  JwtPayload,
  VerifyEmailResponse,
  ResendVerificationResponse,
} from '@vertex/contracts';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  /**
   * Hashes a plaintext password using bcrypt with standard cost factor 10.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verifies password against hash using bcrypt key derivation and length-independent hash comparison.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Queries the database directly to verify whether the user account is currently ACTIVE.
   * Prevents suspended or deactivated users from continuing to use stale JWT tokens.
   */
  async validateActiveUser(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      return !!user && user.status === 'ACTIVE';
    } catch {
      this.logger.warn(`Failed to check user active status for user ID: ${userId}. Failing closed.`);
      return false;
    }
  }

  /**
   * Generates a signed JWT with strict issuer, audience, and expiry claims.
   */
  async generateToken(user: AuthUser): Promise<string> {
    const config = getAppConfig();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      status: user.status,
    };

    return this.jwtService.signAsync(payload, {
      secret: config.jwtSecret,
      expiresIn: config.jwtExpiresIn,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
  }

  /**
   * Authenticates user with email and password.
   * Enforces:
   * - Email normalization
   * - Generic error message for non-existent user or wrong password (prevents email enumeration)
   * - Strict account status checks (rejects SUSPENDED, DEACTIVATED, PENDING_VERIFICATION)
   * - Never returns password hash
   */
  async login(input: unknown): Promise<LoginResponse> {
    let sanitized: { email: string; password: string };
    try {
      sanitized = LoginDto.validateAndSanitize(input);
    } catch (err) {
      throw new UnauthorizedException(err instanceof Error ? err.message : 'Invalid login request.');
    }

    const { email, password } = sanitized;

    // Retrieve user from database
    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { email },
      });
    } catch (dbError) {
      this.logger.error(`Database query failed during login for normalized email: ${email}`);
      throw new UnauthorizedException('Authentication service temporarily unavailable.');
    }

    // Generic error: user does not exist
    if (!user) {
      this.logger.warn(`Login attempt failed: user not found.`);
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Verify password hash
    const isPasswordValid = await this.verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Login attempt failed: invalid password for user ID ${user.id}.`);
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Account Status Validation: strictly enforce account-enumeration prevention.
    // Unknown email, wrong password, SUSPENDED, DEACTIVATED, and PENDING_VERIFICATION
    // all produce the exact same externally visible error: 'Invalid email or password.'
    if (user.status !== 'ACTIVE') {
      this.logger.warn(`Login rejected: account status is "${user.status}" for user ID ${user.id}. Non-ACTIVE account access blocked.`);
      throw new UnauthorizedException('Invalid email or password.');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      status: user.status,
    };

    const token = await this.generateToken(authUser);
    const config = getAppConfig();

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: config.jwtExpiresIn,
      user: authUser,
    };
  }

  /**
   * Fetches active roles and permissions for a user from the database.
   */
  async getUserRoles(userId: string): Promise<UserRoleEvaluationItem[]> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      return userRoles.map((ur) => ({
        roleScope: ur.role.scope as RoleScope,
        organizationId: ur.organizationId,
        isActive: ur.isActive,
        permissions: ur.role.rolePermissions.map((rp) => rp.permission.code),
      }));
    } catch {
      this.logger.warn(`Failed to query user roles for user ${userId}. Returning empty roles.`);
      return [];
    }
  }

  /**
   * Hashes a raw verification token with SHA-256 for secure database storage.
   */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Consumes an email verification or organization invitation token and activates the account.
   * Atomically invalidates the token and updates the user status to ACTIVE.
   */
  async verifyEmail(input: unknown): Promise<VerifyEmailResponse> {
    const dto = VerifyEmailDto.validateAndSanitize(input);
    const tokenHash = this.hashToken(dto.token);

    const tokenRecord = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      this.logger.warn('Email verification attempted with unknown or invalid token.');
      throw new BadRequestException('Invalid or expired verification token.');
    }

    if (tokenRecord.consumedAt) {
      this.logger.warn(`Email verification token already consumed: tokenId=${tokenRecord.id}`);
      throw new BadRequestException('Verification token has already been consumed.');
    }

    if (tokenRecord.revokedAt) {
      this.logger.warn(`Email verification token was revoked: tokenId=${tokenRecord.id}`);
      throw new BadRequestException('Verification token has been revoked.');
    }

    const now = new Date();
    if (tokenRecord.expiresAt < now) {
      this.logger.warn(`Email verification token expired at ${tokenRecord.expiresAt.toISOString()}: tokenId=${tokenRecord.id}`);
      throw new BadRequestException('Verification token has expired.');
    }

    if (tokenRecord.user.status === UserStatus.DEACTIVATED) {
      this.logger.warn(`Email verification attempted for deactivated user ID=${tokenRecord.userId}`);
      throw new BadRequestException('User account has been deactivated.');
    }

    if (tokenRecord.user.status === UserStatus.SUSPENDED) {
      this.logger.warn(`Email verification attempted for suspended user ID=${tokenRecord.userId}`);
      throw new BadRequestException('User account has been suspended.');
    }

    // Credential Enrollment Policy: An unverified account or invited account must provide a new password
    if (
      !dto.password &&
      (tokenRecord.type === 'ORGANIZATION_INVITATION' || tokenRecord.user.status === UserStatus.PENDING_VERIFICATION)
    ) {
      this.logger.warn(
        `Email verification attempted without setting password for unverified/invited account ID=${tokenRecord.userId}`,
      );
      throw new BadRequestException('A password is required to activate an unverified account and complete enrollment.');
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Atomic check-and-set prevents concurrent token consumption race condition
        const updateResult = await tx.verificationToken.updateMany({
          where: {
            id: tokenRecord.id,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            consumedAt: now,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException('Verification token was consumed or revoked concurrently.');
        }

        const userUpdateData: {
          status: UserStatus;
          emailVerifiedAt: Date;
          passwordHash?: string;
        } = {
          status: UserStatus.ACTIVE,
          emailVerifiedAt: now,
        };

        if (dto.password) {
          userUpdateData.passwordHash = await bcrypt.hash(dto.password, 10);
        }

        const updatedUser = await tx.user.update({
          where: { id: tokenRecord.userId },
          data: userUpdateData,
        });

        this.logger.log(
          `User ${updatedUser.id} (${updatedUser.email}) verified and activated via token ${tokenRecord.id}.`,
        );

        return {
          success: true,
          message: 'Email successfully verified and account activated.',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            status: updatedUser.status,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 5000,
      },
    );
  }

  /**
   * Resends an account verification token.
   * Strictly enforces account-enumeration prevention by always returning an identical generic response.
   */
  async resendVerification(input: unknown): Promise<ResendVerificationResponse> {
    const dto = ResendVerificationDto.validateAndSanitize(input);
    const genericResponse: ResendVerificationResponse = {
      success: true,
      message: 'If an unverified account exists for this email, a new verification link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Account Enumeration Prevention: If user does not exist or is not PENDING_VERIFICATION,
    // do not send email, but return the exact same success response.
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      this.logger.warn(
        `Resend verification requested for non-pending or non-existent email (external response suppressed).`,
      );
      return genericResponse;
    }

    const now = new Date();

    // Generate cryptographically secure random token and store its hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const MAX_RETRIES = 3;
    let attempt = 0;
    let tokenIssued = false;

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        await this.prisma.$transaction(
          async (tx) => {
            // Acquire row-level write lock on parent user record to serialize concurrent operations
            await tx.user.update({
              where: { id: user.id },
              data: { updatedAt: now },
            });

            // Find previous active token to preserve token type and tenant context
            const prevToken = await tx.verificationToken.findFirst({
              where: {
                userId: user.id,
                consumedAt: null,
                revokedAt: null,
              },
              orderBy: { createdAt: 'desc' },
            });

            const tokenType = prevToken?.type || 'EMAIL_VERIFICATION';
            const organizationId = prevToken?.organizationId || null;

            // Revoke any existing active tokens for this user
            await tx.verificationToken.updateMany({
              where: {
                userId: user.id,
                consumedAt: null,
                revokedAt: null,
              },
              data: {
                revokedAt: now,
              },
            });

            await tx.verificationToken.create({
              data: {
                userId: user.id,
                organizationId,
                tokenHash,
                type: tokenType,
                expiresAt,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 5000,
          },
        );
        tokenIssued = true;
        break;
      } catch (err) {
        const isSerializationConflict =
          (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2034') ||
          (err instanceof Error &&
            (err.message.includes('could not serialize access') || err.message.includes('deadlock detected')));

        const isUniqueConstraintConflict =
          typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';

        if ((isSerializationConflict || isUniqueConstraintConflict) && attempt < MAX_RETRIES) {
          this.logger.warn(
            `Resend verification concurrency conflict (attempt ${attempt}/${MAX_RETRIES}). Retrying bounded transaction...`,
          );
          await new Promise((resolve) => setTimeout(resolve, attempt * 50));
          continue;
        }

        this.logger.error(`Failed to issue resend verification token after ${attempt} attempts: ${err}`);
        return genericResponse;
      }
    }

    // Only dispatch transactional email if the token issuance was successfully committed
    if (tokenIssued) {
      try {
        await this.emailService.sendVerificationEmail({
          to: user.email,
          recipientName: `${user.firstName} ${user.lastName}`.trim(),
          rawToken,
          expiresInHours: 24,
        });
      } catch (mailErr: any) {
        this.logger.error(
          `Failed to dispatch verification email during resend for user ${user.id}: ${mailErr.message}`,
        );
      }
    }

    return genericResponse;
  }
}

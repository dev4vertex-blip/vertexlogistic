import {
  Injectable,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '@vertex/database';
import type { UserRoleEvaluationItem } from '@vertex/database';
import { RoleScope } from '@prisma/client';
import { getAppConfig } from '../config/env.config.js';
import { LoginDto } from './dto/login.dto.js';
import type { LoginResponse, AuthUser, JwtPayload } from '@vertex/contracts';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
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
}

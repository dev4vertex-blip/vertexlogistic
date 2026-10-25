import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaService } from '@vertex/database';
import { Prisma, RoleScope, OrganizationType, OrganizationStatus, UserType, UserStatus } from '@prisma/client';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { AddOrgUserDto } from './dto/add-org-user.dto.js';
import { UpdateOrgUserStatusDto } from './dto/update-user-status.dto.js';
import { EmailService } from '../email/email.service.js';
import type {
  OrganizationResponse,
  OrgUserResponse,
  PaginatedResult,
  JwtPayload,
} from '@vertex/contracts';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  /**
   * Creates a new Organization and assigns the creator as the initial ORG_OWNER in an atomic transaction.
   */
  async createOrganization(
    userId: string,
    userType: string,
    input: unknown,
  ): Promise<OrganizationResponse> {
    const dto = CreateOrganizationDto.validateAndSanitize(input);

    try {
      // Execute in atomic transaction: Org creation + Role assignment
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Check unique code
        const existingCode = await tx.organization.findUnique({
          where: { code: dto.code },
        });
        if (existingCode) {
          throw new ConflictException(`Organization code "${dto.code}" is already in use.`);
        }

        // 2. Check unique GSTIN if provided
        if (dto.gstin) {
          const existingGstin = await tx.organization.findUnique({
            where: { gstin: dto.gstin },
          });
          if (existingGstin) {
            throw new ConflictException(`GSTIN "${dto.gstin}" is already registered to another organization.`);
          }
        }

        // 3. Create Organization
        const org = await tx.organization.create({
          data: {
            name: dto.name,
            code: dto.code,
            type: dto.type || OrganizationType.ENTERPRISE_CLIENT,
            status: OrganizationStatus.ONBOARDING,
            gstin: dto.gstin || null,
            pan: dto.pan || null,
            billingEmail: dto.billingEmail || null,
            billingPhone: dto.billingPhone || null,
          },
        });

        // 4. Ensure ORG_OWNER role exists with explicit ORGANIZATION scope
        let ownerRole = await tx.role.findFirst({
          where: { code: 'ORG_OWNER', scope: RoleScope.ORGANIZATION },
        });

        if (!ownerRole) {
          ownerRole = await tx.role.create({
            data: {
              code: 'ORG_OWNER',
              name: 'Organization Owner',
              description: 'Primary owner with full administrative and financial authority over the organization',
              scope: RoleScope.ORGANIZATION,
              isSystemDefault: true,
            },
          });
        }

        // 5. Assign creator as initial ORG_OWNER
        await tx.userRole.create({
          data: {
            userId,
            roleId: ownerRole.id,
            organizationId: org.id,
            isActive: true,
          },
        });

        return org;
      });

      this.logger.log(`Organization "${result.name}" (${result.code}) created successfully by user ID: ${userId}`);

      return this.mapOrganizationResponse(result);
    } catch (err) {
      if (err instanceof ConflictException || err instanceof BadRequestException) {
        throw err;
      }
      // Handle Prisma uniqueness conflict
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
        const meta = (err as { meta?: { target?: string[] } }).meta;
        const target = meta?.target?.join(', ') || 'field';
        throw new ConflictException(`Unique constraint violation on: ${target}.`);
      }
      this.logger.error(`Failed to create organization: ${err}`);
      throw new BadRequestException('Organization onboarding failed. Please verify input data.');
    }
  }

  /**
   * Retrieves an organization by ID with server-side tenant isolation enforcement.
   */
  async getOrganization(organizationId: string, user: JwtPayload): Promise<OrganizationResponse> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID "${organizationId}" not found.`);
    }

    // Verify access
    await this.assertUserHasTenantAccess(user, organizationId);

    return this.mapOrganizationResponse(org);
  }

  /**
   * Updates an organization's permitted attributes.
   * Modifying lifecycle status (ACTIVE, SUSPENDED, INACTIVE) is strictly restricted to platform staff with SUPER_ADMIN.
   */
  async updateOrganization(
    organizationId: string,
    user: JwtPayload,
    input: unknown,
  ): Promise<OrganizationResponse> {
    const dto = UpdateOrganizationDto.validateAndSanitize(input);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID "${organizationId}" not found.`);
    }

    // Verify tenant access & admin authorization
    await this.assertUserIsOrgAdmin(user, organizationId);

    // Lifecycle status protection: customer users cannot alter organization status
    if (dto.status !== undefined && user.userType !== UserType.INTERNAL_EMPLOYEE) {
      throw new ForbiddenException('Changing organization lifecycle status requires platform compliance authorization.');
    }

    try {
      // Check GSTIN collision if updating GSTIN
      if (dto.gstin && dto.gstin !== org.gstin) {
        const existingGstin = await this.prisma.organization.findUnique({
          where: { gstin: dto.gstin },
        });
        if (existingGstin && existingGstin.id !== organizationId) {
          throw new ConflictException(`GSTIN "${dto.gstin}" is already registered to another organization.`);
        }
      }

      const updated = await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          name: dto.name !== undefined ? dto.name : undefined,
          status: dto.status !== undefined ? dto.status : undefined,
          gstin: dto.gstin !== undefined ? dto.gstin : undefined,
          pan: dto.pan !== undefined ? dto.pan : undefined,
          billingEmail: dto.billingEmail !== undefined ? dto.billingEmail : undefined,
          billingPhone: dto.billingPhone !== undefined ? dto.billingPhone : undefined,
        },
      });

      this.logger.log(`Organization ${organizationId} updated by user ID: ${user.sub}`);
      return this.mapOrganizationResponse(updated);
    } catch (err) {
      if (err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new ConflictException('Unique attribute conflict during organization update.');
      }
      this.logger.error(`Error updating organization ${organizationId}: ${err}`);
      throw new BadRequestException('Organization update failed.');
    }
  }

  /**
   * Lists users belonging to an organization with pagination and response sanitization.
   */
  async listOrganizationUsers(
    organizationId: string,
    user: JwtPayload,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<OrgUserResponse>> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID "${organizationId}" not found.`);
    }

    await this.assertUserHasTenantAccess(user, organizationId);

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [userRoles, total] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { organizationId, isActive: true },
        include: {
          user: true,
          role: true,
        },
        skip,
        take: safeLimit,
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.userRole.count({
        where: { organizationId, isActive: true },
      }),
    ]);

    const items: OrgUserResponse[] = userRoles.map((ur) => ({
      id: ur.id,
      userId: ur.user.id,
      email: ur.user.email,
      firstName: ur.user.firstName,
      lastName: ur.user.lastName,
      userType: ur.user.userType,
      status: ur.user.status,
      role: {
        id: ur.role.id,
        code: ur.role.code,
        name: ur.role.name,
      },
      isActive: ur.isActive,
      assignedAt: ur.assignedAt.toISOString(),
    }));

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * Adds or invites a user to the organization.
   * If user doesn't exist, creates account in PENDING_VERIFICATION state.
   * Strictly prevents assigning platform internal roles or self-escalation.
   */
  async addOrganizationUser(
    organizationId: string,
    actor: JwtPayload,
    input: unknown,
  ): Promise<OrgUserResponse> {
    const dto = AddOrgUserDto.validateAndSanitize(input);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID "${organizationId}" not found.`);
    }

    // Verify actor is authorized admin/owner in this organization
    const actorRole = await this.assertUserIsOrgAdmin(actor, organizationId);

    // Privilege Escalation Prevention: Only an ORG_OWNER or platform SUPER_ADMIN can assign ORG_OWNER
    if (dto.roleCode === 'ORG_OWNER') {
      const isOwnerOrSuper = actorRole === 'ORG_OWNER' || actor.userType === UserType.INTERNAL_EMPLOYEE;
      if (!isOwnerOrSuper) {
        throw new ForbiddenException('Only organization owners or platform admins can assign the ORG_OWNER role.');
      }
    }

    // Find requested role with strict ORGANIZATION scope
    const role = await this.prisma.role.findFirst({
      where: { code: dto.roleCode, scope: RoleScope.ORGANIZATION },
    });

    if (!role) {
      throw new NotFoundException(`Organization role with code "${dto.roleCode}" does not exist.`);
    }

    // Find or create user
    let targetUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (targetUser) {
      // Platform staff cannot be recruited into customer tenant orgs
      if (targetUser.userType === UserType.INTERNAL_EMPLOYEE) {
        throw new ForbiddenException('Cannot recruit platform internal employees into customer tenant organizations.');
      }

      // Check if already assigned this role in the organization
      const existingAssignment = await this.prisma.userRole.findFirst({
        where: {
          userId: targetUser.id,
          organizationId,
          roleId: role.id,
          isActive: true,
        },
      });

      if (existingAssignment) {
        throw new ConflictException(`User "${dto.email}" is already assigned role "${dto.roleCode}" in this organization.`);
      }
    } else {
      // Create user in PENDING_VERIFICATION state (secure random placeholder hash, no plaintext credentials)
      const randomSecret = crypto.randomBytes(32).toString('hex');
      const placeholderHash = await bcrypt.hash(randomSecret, 10);

      targetUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone || null,
          passwordHash: placeholderHash,
          userType: UserType.CUSTOMER_USER,
          status: UserStatus.PENDING_VERIFICATION,
        },
      });

      this.logger.log(`Created new pending user account for ${dto.email} (ID: ${targetUser.id}). Missing activation workflow documented.`);
    }

    // Create user role assignment
    const userRole = await this.prisma.userRole.create({
      data: {
        userId: targetUser.id,
        roleId: role.id,
        organizationId,
        isActive: true,
      },
      include: {
        role: true,
        user: true,
      },
    });

    this.logger.log(`Assigned role ${role.code} in org ${organizationId} to user ${targetUser.id} by actor ${actor.sub}`);

    // If the target user is in PENDING_VERIFICATION state, issue an invitation token and dispatch invitation email
    if (targetUser.status === UserStatus.PENDING_VERIFICATION) {
      const now = new Date();
      // Generate cryptographically secure invitation token and store only the SHA-256 hash
      const rawInvitationToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours for invitations

      let tokenIssued = false;
      const MAX_TOKEN_RETRIES = 3;
      let tokenAttempt = 0;

      while (tokenAttempt < MAX_TOKEN_RETRIES) {
        tokenAttempt++;
        try {
          await this.prisma.$transaction(
            async (tx) => {
              // Acquire row-level write lock on parent user record to serialize concurrent operations
              await tx.user.update({
                where: { id: targetUser.id },
                data: { updatedAt: now },
              });

              // Revoke any previously unconsumed invitation tokens for this user in this organization
              await tx.verificationToken.updateMany({
                where: {
                  userId: targetUser.id,
                  organizationId,
                  consumedAt: null,
                  revokedAt: null,
                },
                data: {
                  revokedAt: now,
                },
              });

              await tx.verificationToken.create({
                data: {
                  userId: targetUser.id,
                  organizationId,
                  tokenHash,
                  type: 'ORGANIZATION_INVITATION',
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
        } catch (tokenErr) {
          const isSerializationConflict =
            (typeof tokenErr === 'object' && tokenErr !== null && 'code' in tokenErr && (tokenErr as { code: string }).code === 'P2034') ||
            (tokenErr instanceof Error && (tokenErr.message.includes('could not serialize access') || tokenErr.message.includes('deadlock detected')));

          const isUniqueConstraintConflict =
            typeof tokenErr === 'object' && tokenErr !== null && 'code' in tokenErr && (tokenErr as { code: string }).code === 'P2002';

          if ((isSerializationConflict || isUniqueConstraintConflict) && tokenAttempt < MAX_TOKEN_RETRIES) {
            this.logger.warn(`Token creation concurrency conflict in addOrganizationUser (attempt ${tokenAttempt}/${MAX_TOKEN_RETRIES}). Retrying...`);
            await new Promise((resolve) => setTimeout(resolve, tokenAttempt * 50));
            continue;
          }

          this.logger.error(`Failed to record invitation token for user ${targetUser.id} in org ${organizationId}: ${tokenErr}`);
          break;
        }
      }

      // Only dispatch transactional email if token issuance was successfully committed
      if (tokenIssued) {
        try {
          await this.emailService.sendInvitationEmail({
            to: targetUser.email,
            recipientName: `${targetUser.firstName} ${targetUser.lastName}`.trim(),
            organizationName: org.name,
            rawToken: rawInvitationToken,
            expiresInHours: 48,
          });
        } catch (mailErr: any) {
          this.logger.error(`Failed to dispatch invitation email to ${targetUser.email}: ${mailErr.message}`);
        }
      }
    }

    return {
      id: userRole.id,
      userId: targetUser.id,
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      userType: targetUser.userType,
      status: targetUser.status,
      role: {
        id: role.id,
        code: role.code,
        name: role.name,
      },
      isActive: userRole.isActive,
      assignedAt: userRole.assignedAt.toISOString(),
    };
  }

  /**
   * Updates an organization user's lifecycle status.
   * Multi-Tenant Isolation Protection:
   * - Organization admins can only deactivate or activate user membership in THEIR organization (`UserRole.isActive`).
   * - Organization admins CANNOT globally suspend users who also belong to other organizations!
   * - Protects the LAST active ORG_OWNER from demotion or deactivation in an atomic transaction.
   */
  async updateOrgUserStatus(
    organizationId: string,
    targetUserId: string,
    actor: JwtPayload,
    input: unknown,
  ): Promise<{ success: boolean; message: string; user: { id: string; status: UserStatus; tenantIsActive: boolean } }> {
    const dto = UpdateOrgUserStatusDto.validateAndSanitize(input);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID "${organizationId}" not found.`);
    }

    // Verify actor authority
    const actorRole = await this.assertUserIsOrgAdmin(actor, organizationId);

    // Bounded retry loop for Serializable transaction concurrency conflicts (P2034 / SQLSTATE 40001)
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Verify target user is assigned to this organization (supporting multi-role assignments)
            const targetUserRoles = await tx.userRole.findMany({
              where: {
                organizationId,
                userId: targetUserId,
              },
              include: {
                role: true,
                user: true,
              },
            });

            if (!targetUserRoles || targetUserRoles.length === 0 || !targetUserRoles[0]) {
              throw new NotFoundException(`User with ID "${targetUserId}" is not a member of organization "${organizationId}".`);
            }

            const targetUser = targetUserRoles[0].user;
            const hasOwnerRole = targetUserRoles.some((ur) => ur.role.code === 'ORG_OWNER');

            // Privilege Protection: Only an ORG_OWNER or SUPER_ADMIN can modify an ORG_OWNER's status (deactivation OR reactivation)
            if (hasOwnerRole && actorRole !== 'ORG_OWNER' && actor.userType !== UserType.INTERNAL_EMPLOYEE) {
              throw new ForbiddenException('Enterprise Administrators cannot deactivate, reactivate, or modify an Organization Owner.');
            }

            // LAST ACTIVE OWNER PROTECTION
            if (hasOwnerRole && dto.status !== UserStatus.ACTIVE) {
              // Count active owners in this organization inside the Serializable transaction
              const activeOwnersCount = await tx.userRole.count({
                where: {
                  organizationId,
                  role: { code: 'ORG_OWNER' },
                  isActive: true,
                  user: { status: UserStatus.ACTIVE },
                },
              });

              if (activeOwnersCount <= 1) {
                throw new ForbiddenException('Cannot deactivate or suspend the last active organization owner.');
              }
            }

            // Tenant-Local Membership Status:
            // Revoke or restore ALL active roles for this user in this organization
            const isRoleActive = dto.status === UserStatus.ACTIVE;
            await tx.userRole.updateMany({
              where: { organizationId, userId: targetUserId },
              data: { isActive: isRoleActive },
            });

            // Check whether target user belongs to OTHER organizations
            const otherOrgRolesCount = await tx.userRole.count({
              where: {
                userId: targetUserId,
                organizationId: { not: organizationId },
                isActive: true,
              },
            });

            let resultingUserStatus = targetUser.status;

            // Only update global User.status if user belongs exclusively to this organization or actor is platform staff
            if (actor.userType === UserType.INTERNAL_EMPLOYEE) {
              const updated = await tx.user.update({
                where: { id: targetUserId },
                data: { status: dto.status },
              });
              resultingUserStatus = updated.status;
            } else if (otherOrgRolesCount === 0) {
              // Single-tenant user: update status safely
              const updated = await tx.user.update({
                where: { id: targetUserId },
                data: { status: dto.status },
              });
              resultingUserStatus = updated.status;
            } else {
              // Multi-tenant user: prevent tenant admin from globally suspending cross-tenant user!
              this.logger.warn(
                `Tenant admin ${actor.sub} updated user ${targetUserId} in org ${organizationId} (active: ${isRoleActive}). ` +
                `User belongs to ${otherOrgRolesCount} other organization(s); global user status preserved as ${resultingUserStatus}.`,
              );
            }

            this.logger.log(`User ${targetUserId} tenant membership updated (active: ${isRoleActive}) in org ${organizationId} by actor ${actor.sub}`);

            return {
              success: true,
              message: otherOrgRolesCount > 0
                ? `User membership updated for this organization. Global account remains active for other assigned organizations.`
                : `User status successfully updated to ${dto.status}.`,
              user: {
                id: targetUserId,
                status: resultingUserStatus,
                tenantIsActive: isRoleActive,
              },
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 5000,
          },
        );
      } catch (err) {
        if (err instanceof ForbiddenException || err instanceof NotFoundException || err instanceof BadRequestException) {
          throw err;
        }

        // Detect PostgreSQL serialization failure / deadlock conflict (P2034)
        const isSerializationConflict =
          (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2034') ||
          (err instanceof Error && (err.message.includes('could not serialize access') || err.message.includes('deadlock detected')));

        if (isSerializationConflict && attempt < MAX_RETRIES) {
          const jitter = Math.floor(Math.random() * 25);
          const backoffMs = attempt * 50 + jitter;
          this.logger.warn(`Serialization conflict detected during owner status update (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        if (isSerializationConflict) {
          this.logger.error(`Exhausted ${MAX_RETRIES} transaction retries due to concurrent serialization conflicts.`);
          throw new ConflictException('Concurrent modification conflict on organization owner status. Please retry the request.');
        }

        this.logger.error(`Unexpected transaction error during user status update: ${err}`);
        throw new BadRequestException('User status update failed.');
      }
    }

    throw new ConflictException('Transaction retry limit exceeded.');
  }

  // --------------------------------------------------------------------------
  // Helper Authorization Assertions
  // --------------------------------------------------------------------------

  private async assertUserHasTenantAccess(user: JwtPayload, organizationId: string): Promise<void> {
    // Platform employee access requires explicit internal authorization, not merely employee identity
    if (user.userType === UserType.INTERNAL_EMPLOYEE) {
      const internalRole = await this.prisma.userRole.findFirst({
        where: {
          userId: user.sub,
          isActive: true,
          role: { scope: RoleScope.SYSTEM_INTERNAL },
        },
      });
      if (internalRole) {
        return;
      }
      throw new ForbiddenException('Platform employee lacks internal authorization for tenant data access.');
    }

    const membership = await this.prisma.userRole.findFirst({
      where: {
        userId: user.sub,
        organizationId,
        isActive: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(`Cross-tenant access prohibited for organization "${organizationId}".`);
    }
  }

  private async assertUserIsOrgAdmin(user: JwtPayload, organizationId: string): Promise<string> {
    // Platform staff access requires explicit SUPER_ADMIN role
    if (user.userType === UserType.INTERNAL_EMPLOYEE) {
      const superAdminRole = await this.prisma.userRole.findFirst({
        where: {
          userId: user.sub,
          isActive: true,
          role: { scope: RoleScope.SYSTEM_INTERNAL, code: 'SUPER_ADMIN' },
        },
      });
      if (superAdminRole) {
        return 'SUPER_ADMIN';
      }
      throw new ForbiddenException('Platform employee lacks required administrative privileges.');
    }

    const membership = await this.prisma.userRole.findFirst({
      where: {
        userId: user.sub,
        organizationId,
        isActive: true,
      },
      include: {
        role: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(`Cross-tenant access prohibited for organization "${organizationId}".`);
    }

    const allowedAdminRoles = ['ORG_OWNER', 'ENTERPRISE_ADMIN'];
    if (!allowedAdminRoles.includes(membership.role.code)) {
      throw new ForbiddenException('Administrative authority required for this operation.');
    }

    return membership.role.code;
  }

  private mapOrganizationResponse(org: {
    id: string;
    name: string;
    code: string;
    type: string;
    status: string;
    gstin?: string | null;
    pan?: string | null;
    billingEmail?: string | null;
    billingPhone?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): OrganizationResponse {
    return {
      id: org.id,
      name: org.name,
      code: org.code,
      type: org.type,
      status: org.status,
      gstin: org.gstin || null,
      pan: org.pan || null,
      billingEmail: org.billingEmail || null,
      billingPhone: org.billingPhone || null,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }
}

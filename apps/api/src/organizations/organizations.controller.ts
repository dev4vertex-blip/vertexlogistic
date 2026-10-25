import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/auth.decorators.js';
import { OrganizationsService } from './organizations.service.js';
import type { JwtPayload, OrganizationResponse, OrgUserResponse, PaginatedResult } from '@vertex/contracts';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly organizationsService: OrganizationsService,
  ) {}

  /**
   * POST /api/organizations
   * Creates a new organization with initial ONBOARDING status and assigns creator as ORG_OWNER.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ): Promise<OrganizationResponse> {
    return this.organizationsService.createOrganization(user.sub, user.userType, body);
  }

  /**
   * GET /api/organizations/:organizationId
   * Retrieves an authorized organization by ID. Cross-tenant access denied.
   */
  @Get(':organizationId')
  @HttpCode(HttpStatus.OK)
  async getOrganization(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrganizationResponse> {
    return this.organizationsService.getOrganization(organizationId, user);
  }

  /**
   * PATCH /api/organizations/:organizationId
   * Updates an organization's profile and billing information.
   */
  @Patch(':organizationId')
  @HttpCode(HttpStatus.OK)
  async updateOrganization(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ): Promise<OrganizationResponse> {
    return this.organizationsService.updateOrganization(organizationId, user, body);
  }

  /**
   * GET /api/organizations/:organizationId/users
   * Lists users in an authorized organization with pagination and response sanitization.
   */
  @Get(':organizationId/users')
  @HttpCode(HttpStatus.OK)
  async listOrganizationUsers(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResult<OrgUserResponse>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.organizationsService.listOrganizationUsers(organizationId, user, pageNum, limitNum);
  }

  /**
   * POST /api/organizations/:organizationId/users
   * Adds or invites a user to the organization.
   */
  @Post(':organizationId/users')
  @HttpCode(HttpStatus.CREATED)
  async addOrganizationUser(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ): Promise<OrgUserResponse> {
    return this.organizationsService.addOrganizationUser(organizationId, user, body);
  }

  /**
   * PATCH /api/organizations/:organizationId/users/:userId/status
   * Updates a user's lifecycle status within the organization. Enforces last-owner protection.
   */
  @Patch(':organizationId/users/:userId/status')
  @HttpCode(HttpStatus.OK)
  async updateOrgUserStatus(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return this.organizationsService.updateOrgUserStatus(organizationId, userId, user, body);
  }
}

import { BadRequestException } from '@nestjs/common';
import { normalizeEmail } from '@vertex/database';

export class AddOrgUserDto {
  email!: string;
  firstName!: string;
  lastName!: string;
  phone?: string;
  roleCode!: string;

  static validateAndSanitize(input: unknown): AddOrgUserDto {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Request body must be a valid JSON object.');
    }

    const raw = input as Record<string, unknown>;

    // 1. Email validation & normalization
    if (!raw.email || typeof raw.email !== 'string') {
      throw new BadRequestException('User email is required.');
    }
    let email: string;
    try {
      email = normalizeEmail(raw.email);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid user email.');
    }

    // 2. Name validation
    if (!raw.firstName || typeof raw.firstName !== 'string' || raw.firstName.trim().length === 0) {
      throw new BadRequestException('First name is required.');
    }
    if (raw.firstName.trim().length > 60) {
      throw new BadRequestException('First name cannot exceed 60 characters.');
    }
    const firstName = raw.firstName.trim();

    if (!raw.lastName || typeof raw.lastName !== 'string' || raw.lastName.trim().length === 0) {
      throw new BadRequestException('Last name is required.');
    }
    if (raw.lastName.trim().length > 60) {
      throw new BadRequestException('Last name cannot exceed 60 characters.');
    }
    const lastName = raw.lastName.trim();

    // 3. Phone validation (optional)
    let phone: string | undefined;
    if (raw.phone && typeof raw.phone === 'string' && raw.phone.trim() !== '') {
      const phoneClean = raw.phone.trim();
      const phoneRegex = /^\+?[0-9]{8,15}$/;
      if (!phoneRegex.test(phoneClean)) {
        throw new BadRequestException(`Invalid phone format: "${raw.phone}". Must be 8-15 digits.`);
      }
      phone = phoneClean;
    }

    // 4. Role Code validation
    if (!raw.roleCode || typeof raw.roleCode !== 'string') {
      throw new BadRequestException('Role code is required.');
    }
    const roleCode = raw.roleCode.trim().toUpperCase();

    // System internal roles cannot be assigned to organization users
    const systemInternalRoles = ['SUPER_ADMIN', 'HUB_OPERATOR', 'BRANCH_MANAGER', 'FINANCE_ADMIN'];
    if (systemInternalRoles.includes(roleCode)) {
      throw new BadRequestException(`Cannot assign platform internal role "${roleCode}" to an organization user.`);
    }

    return {
      email,
      firstName,
      lastName,
      phone,
      roleCode,
    };
  }
}

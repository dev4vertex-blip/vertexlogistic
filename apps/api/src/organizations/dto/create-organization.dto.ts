import { BadRequestException } from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { normalizeEmail } from '@vertex/database';

export class CreateOrganizationDto {
  name!: string;
  code!: string;
  type?: OrganizationType;
  gstin?: string;
  pan?: string;
  billingEmail?: string;
  billingPhone?: string;

  static validateAndSanitize(input: unknown): CreateOrganizationDto {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Request body must be a valid JSON object.');
    }

    const raw = input as Record<string, unknown>;

    // 1. Name validation
    if (!raw.name || typeof raw.name !== 'string' || raw.name.trim().length < 2) {
      throw new BadRequestException('Organization name is required and must be at least 2 characters.');
    }
    if (raw.name.trim().length > 120) {
      throw new BadRequestException('Organization name cannot exceed 120 characters.');
    }
    const name = raw.name.trim();

    // 2. Code validation and uppercase normalization
    if (!raw.code || typeof raw.code !== 'string') {
      throw new BadRequestException('Organization code is required.');
    }
    const code = raw.code.trim().toUpperCase();
    const codeRegex = /^[A-Z0-9_-]{3,30}$/;
    if (!codeRegex.test(code)) {
      throw new BadRequestException('Organization code must be 3-30 alphanumeric characters, hyphens or underscores (e.g. "ORG-ACME-001").');
    }

    // 3. Organization Type
    let type: OrganizationType = OrganizationType.ENTERPRISE_CLIENT;
    if (raw.type) {
      if (typeof raw.type !== 'string' || !Object.values(OrganizationType).includes(raw.type as OrganizationType)) {
        throw new BadRequestException(`Invalid organization type: "${raw.type}". Allowed: ${Object.values(OrganizationType).join(', ')}.`);
      }
      type = raw.type as OrganizationType;
    }

    // 4. GSTIN validation (optional)
    let gstin: string | undefined;
    if (raw.gstin && typeof raw.gstin === 'string' && raw.gstin.trim() !== '') {
      const normalizedGstin = raw.gstin.trim().toUpperCase();
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(normalizedGstin)) {
        throw new BadRequestException(`Invalid GSTIN format: "${raw.gstin}". Must be a valid 15-character Indian GSTIN.`);
      }
      gstin = normalizedGstin;
    }

    // 5. PAN validation (optional)
    let pan: string | undefined;
    if (raw.pan && typeof raw.pan === 'string' && raw.pan.trim() !== '') {
      const normalizedPan = raw.pan.trim().toUpperCase();
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(normalizedPan)) {
        throw new BadRequestException(`Invalid PAN format: "${raw.pan}". Must be a valid 10-character Indian PAN.`);
      }
      pan = normalizedPan;
    }

    // 6. Billing Email validation (optional)
    let billingEmail: string | undefined;
    if (raw.billingEmail && typeof raw.billingEmail === 'string' && raw.billingEmail.trim() !== '') {
      try {
        billingEmail = normalizeEmail(raw.billingEmail);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Invalid billing email.');
      }
    }

    // 7. Billing Phone validation (optional)
    let billingPhone: string | undefined;
    if (raw.billingPhone && typeof raw.billingPhone === 'string' && raw.billingPhone.trim() !== '') {
      const phoneClean = raw.billingPhone.trim();
      const phoneRegex = /^\+?[0-9]{8,15}$/;
      if (!phoneRegex.test(phoneClean)) {
        throw new BadRequestException(`Invalid billing phone format: "${raw.billingPhone}". Must be 8-15 digits.`);
      }
      billingPhone = phoneClean;
    }

    return {
      name,
      code,
      type,
      gstin,
      pan,
      billingEmail,
      billingPhone,
    };
  }
}

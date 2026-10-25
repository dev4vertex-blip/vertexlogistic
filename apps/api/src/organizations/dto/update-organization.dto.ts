import { BadRequestException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { normalizeEmail } from '@vertex/database';

export class UpdateOrganizationDto {
  name?: string;
  status?: OrganizationStatus;
  gstin?: string;
  pan?: string;
  billingEmail?: string;
  billingPhone?: string;

  static validateAndSanitize(input: unknown): UpdateOrganizationDto {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Request body must be a valid JSON object.');
    }

    const raw = input as Record<string, unknown>;

    // Reject unpermitted immutables
    if ('id' in raw || 'code' in raw || 'createdAt' in raw || 'updatedAt' in raw) {
      throw new BadRequestException('Fields "id", "code", and system timestamps are immutable and cannot be updated.');
    }

    const result: UpdateOrganizationDto = {};

    if (raw.name !== undefined) {
      if (typeof raw.name !== 'string' || raw.name.trim().length < 2) {
        throw new BadRequestException('Organization name must be at least 2 characters.');
      }
      if (raw.name.trim().length > 120) {
        throw new BadRequestException('Organization name cannot exceed 120 characters.');
      }
      result.name = raw.name.trim();
    }

    if (raw.status !== undefined) {
      if (typeof raw.status !== 'string' || !Object.values(OrganizationStatus).includes(raw.status as OrganizationStatus)) {
        throw new BadRequestException(`Invalid organization status: "${raw.status}". Allowed: ${Object.values(OrganizationStatus).join(', ')}.`);
      }
      result.status = raw.status as OrganizationStatus;
    }

    if (raw.gstin !== undefined) {
      if (raw.gstin === null || raw.gstin === '') {
        result.gstin = undefined;
      } else if (typeof raw.gstin === 'string') {
        const normalizedGstin = raw.gstin.trim().toUpperCase();
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!gstinRegex.test(normalizedGstin)) {
          throw new BadRequestException(`Invalid GSTIN format: "${raw.gstin}". Must be a valid 15-character Indian GSTIN.`);
        }
        result.gstin = normalizedGstin;
      } else {
        throw new BadRequestException('GSTIN must be a string or null.');
      }
    }

    if (raw.pan !== undefined) {
      if (raw.pan === null || raw.pan === '') {
        result.pan = undefined;
      } else if (typeof raw.pan === 'string') {
        const normalizedPan = raw.pan.trim().toUpperCase();
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(normalizedPan)) {
          throw new BadRequestException(`Invalid PAN format: "${raw.pan}". Must be a valid 10-character Indian PAN.`);
        }
        result.pan = normalizedPan;
      } else {
        throw new BadRequestException('PAN must be a string or null.');
      }
    }

    if (raw.billingEmail !== undefined) {
      if (raw.billingEmail === null || raw.billingEmail === '') {
        result.billingEmail = undefined;
      } else if (typeof raw.billingEmail === 'string') {
        try {
          result.billingEmail = normalizeEmail(raw.billingEmail);
        } catch (e) {
          throw new BadRequestException(e instanceof Error ? e.message : 'Invalid billing email.');
        }
      }
    }

    if (raw.billingPhone !== undefined) {
      if (raw.billingPhone === null || raw.billingPhone === '') {
        result.billingPhone = undefined;
      } else if (typeof raw.billingPhone === 'string') {
        const phoneClean = raw.billingPhone.trim();
        const phoneRegex = /^\+?[0-9]{8,15}$/;
        if (!phoneRegex.test(phoneClean)) {
          throw new BadRequestException(`Invalid billing phone format: "${raw.billingPhone}". Must be 8-15 digits.`);
        }
        result.billingPhone = phoneClean;
      }
    }

    if (Object.keys(result).length === 0) {
      throw new BadRequestException('At least one updatable field must be provided.');
    }

    return result;
  }
}

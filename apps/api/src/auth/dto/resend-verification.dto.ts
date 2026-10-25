import { BadRequestException } from '@nestjs/common';
import type { ResendVerificationRequest } from '@vertex/contracts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ResendVerificationDto implements ResendVerificationRequest {
  email!: string;

  static validateAndSanitize(input: unknown): ResendVerificationDto {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Request body must be a valid JSON object.');
    }

    const { email } = input as Record<string, unknown>;

    if (typeof email !== 'string' || !email.trim()) {
      throw new BadRequestException('Email address is required.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new BadRequestException('Invalid email address format.');
    }

    const dto = new ResendVerificationDto();
    dto.email = normalizedEmail;
    return dto;
  }
}

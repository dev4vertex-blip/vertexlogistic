import { BadRequestException } from '@nestjs/common';
import type { VerifyEmailRequest } from '@vertex/contracts';

export class VerifyEmailDto implements VerifyEmailRequest {
  token!: string;
  password?: string;

  static validateAndSanitize(input: unknown): VerifyEmailDto {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Request body must be a valid JSON object.');
    }

    const { token, password } = input as Record<string, unknown>;

    if (typeof token !== 'string' || !token.trim()) {
      throw new BadRequestException('Verification token is required.');
    }

    const sanitizedToken = token.trim();
    if (sanitizedToken.length < 16) {
      throw new BadRequestException('Verification token format is invalid.');
    }

    const dto = new VerifyEmailDto();
    dto.token = sanitizedToken;

    if (password !== undefined && password !== null) {
      if (typeof password !== 'string') {
        throw new BadRequestException('Password must be a string.');
      }
      if (password.length < 8) {
        throw new BadRequestException('Password must be at least 8 characters long.');
      }
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);

      if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        throw new BadRequestException(
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
        );
      }
      dto.password = password;
    }

    return dto;
  }
}

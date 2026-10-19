import { normalizeEmail } from '@vertex/database';

export class LoginDto {
  email!: string;
  password!: string;

  static validateAndSanitize(input: unknown): { email: string; password: string } {
    if (!input || typeof input !== 'object') {
      throw new Error('Request body must be a valid JSON object.');
    }

    const { email, password } = input as Record<string, unknown>;

    if (!email || typeof email !== 'string') {
      throw new Error('Email is required and must be a valid string.');
    }

    if (!password || typeof password !== 'string') {
      throw new Error('Password is required.');
    }

    if (password.length > 256) {
      throw new Error('Password exceeds maximum permissible length.');
    }

    // Normalizes email (trim, lowercase, RFC 5322 sanity check)
    const normalizedEmail = normalizeEmail(email);

    return {
      email: normalizedEmail,
      password,
    };
  }
}

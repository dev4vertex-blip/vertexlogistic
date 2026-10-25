import { UserStatus } from '@prisma/client';

export class UpdateOrgUserStatusDto {
  status!: UserStatus;

  static validateAndSanitize(input: unknown): UpdateOrgUserStatusDto {
    if (!input || typeof input !== 'object') {
      throw new Error('Request body must be a valid JSON object.');
    }

    const raw = input as Record<string, unknown>;

    if (!raw.status || typeof raw.status !== 'string') {
      throw new Error('Status field is required.');
    }

    const validStatuses: UserStatus[] = [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED];
    if (!validStatuses.includes(raw.status as UserStatus)) {
      throw new Error(`Invalid status: "${raw.status}". Permitted values: ${validStatuses.join(', ')}.`);
    }

    return {
      status: raw.status as UserStatus,
    };
  }
}

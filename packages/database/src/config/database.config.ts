export interface DatabaseConfig {
  databaseUrl: string;
  isConfigured: boolean;
  maskedHost: string;
}

/**
 * Validates and parses DATABASE_URL without leaking credentials in error messages or logs.
 */
export function validateDatabaseConfig(rawUrl?: string): DatabaseConfig {
  if (!rawUrl || rawUrl.trim() === '') {
    return {
      databaseUrl: '',
      isConfigured: false,
      maskedHost: 'unconfigured',
    };
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      throw new Error(`Invalid protocol '${parsed.protocol}'. Database protocol must be 'postgresql:' or 'postgres:'.`);
    }

    const host = parsed.hostname || 'unknown-host';
    const port = parsed.port || '5432';

    return {
      databaseUrl: rawUrl,
      isConfigured: true,
      maskedHost: `${host}:${port}`,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid protocol')) {
      throw err;
    }
    throw new Error('DATABASE_URL format is invalid. Please provide a standard postgresql:// connection URI.');
  }
}

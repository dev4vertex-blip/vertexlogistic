import { describe, it, expect } from 'vitest';
import { validateDatabaseConfig } from '../src/config/database.config.js';

describe('@vertex/database - Configuration & Masking Tests', () => {
  it('1. should return isConfigured: false for empty or undefined URL', () => {
    const res1 = validateDatabaseConfig(undefined);
    expect(res1.isConfigured).toBe(false);
    expect(res1.databaseUrl).toBe('');
    expect(res1.maskedHost).toBe('unconfigured');

    const res2 = validateDatabaseConfig('');
    expect(res2.isConfigured).toBe(false);
  });

  it('2. should correctly parse valid PostgreSQL connection URLs without leaking password in host', () => {
    const raw = 'postgresql://super_user:secret_password_123@db.example.com:5432/vertex_prod?schema=public';
    const res = validateDatabaseConfig(raw);
    expect(res.isConfigured).toBe(true);
    expect(res.maskedHost).toBe('db.example.com:5432');
    expect(res.maskedHost).not.toContain('secret_password_123');
    expect(res.maskedHost).not.toContain('super_user');
  });

  it('3. should reject non-PostgreSQL database protocols', () => {
    expect(() => validateDatabaseConfig('mysql://root:secret@localhost:3306/db')).toThrowError(
      /Database protocol must be 'postgresql:' or 'postgres:'/,
    );
  });
});

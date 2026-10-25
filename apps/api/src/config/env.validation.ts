import { AppConfig, getAppConfig } from './env.config.js';

export function validateEnvironment(env: NodeJS.ProcessEnv): AppConfig {
  if (env.NODE_ENV && !['development', 'production', 'test'].includes(env.NODE_ENV)) {
    throw new Error(`Invalid NODE_ENV: "${env.NODE_ENV}". Must be 'development', 'production', or 'test'.`);
  }

  if (env.PORT) {
    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`PORT must be an integer between 1 and 65535. Received: "${env.PORT}".`);
    }
  }

  if (env.NODE_ENV === 'production') {
    if (!env.JWT_SECRET || env.JWT_SECRET.trim() === '') {
      throw new Error('JWT_SECRET is required in production environment.');
    }
    if (env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
  } else if (env.JWT_SECRET && env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters.');
  }

  return getAppConfig();
}

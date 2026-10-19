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

  return getAppConfig();
}

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  apiPrefix: string;
  serviceName: string;
  serviceVersion: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtIssuer: string;
  jwtAudience: string;
}

export const APP_VERSION = '0.1.0';
export const APP_SERVICE_NAME = 'vertex-logistics-api';

export function getAppConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development';
  const port = parseInt(process.env.PORT || '3001', 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT configuration: ${process.env.PORT}`);
  }

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  const devDefaultSecret = 'vertex-dev-secret-key-32-bytes-minimum-length!';
  const jwtSecret = process.env.JWT_SECRET || devDefaultSecret;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';
  const jwtIssuer = process.env.JWT_ISSUER || 'vertex-logistics';
  const jwtAudience = process.env.JWT_AUDIENCE || 'vertex-api';

  return {
    port,
    nodeEnv,
    apiPrefix: 'api',
    serviceName: APP_SERVICE_NAME,
    serviceVersion: APP_VERSION,
    corsOrigins,
    jwtSecret,
    jwtExpiresIn,
    jwtIssuer,
    jwtAudience,
  };
}

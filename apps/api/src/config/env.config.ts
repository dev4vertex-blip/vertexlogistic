export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  apiPrefix: string;
  serviceName: string;
  serviceVersion: string;
  corsOrigins: string[];
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

  return {
    port,
    nodeEnv,
    apiPrefix: 'api',
    serviceName: APP_SERVICE_NAME,
    serviceVersion: APP_VERSION,
    corsOrigins,
  };
}

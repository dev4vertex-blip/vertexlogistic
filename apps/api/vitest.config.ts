import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@vertex/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@vertex/database': path.resolve(__dirname, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/api/test/**/*.{spec,e2e-spec}.ts', 'apps/api/src/**/*.spec.ts'],
    testTimeout: 15000,
  },
});

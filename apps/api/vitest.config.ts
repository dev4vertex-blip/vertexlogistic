import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/api/test/**/*.{spec,e2e-spec}.ts', 'apps/api/src/**/*.spec.ts'],
    testTimeout: 15000,
  },
});

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // DB-backed tests hit the same tenant/pool state; keep it simple and sequential.
    fileParallelism: false,
  },
});

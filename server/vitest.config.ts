import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    // Tests share one ephemeral SQLite file, so files run one at a time.
    fileParallelism: false,
    testTimeout: 15000,
    env: {
      // Prisma resolves a relative SQLite path relative to schema.prisma's
      // folder (server/prisma), not the process cwd — keep this in sync
      // with tests/globalSetup.ts's dbPath.
      DATABASE_URL: 'file:./test.db',
      COOKIE_SECRET: 'test-cookie-secret',
      NODE_ENV: 'test',
    },
  },
});

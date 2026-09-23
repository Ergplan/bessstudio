import { defineConfig } from 'vitest/config';

// The browser crawl runs against `out/`, so it is separate from the unit suite: it needs a build
// first, it takes minutes rather than seconds, and a suite that cannot run without a build step is
// a suite that gets skipped if it shares a command with one that can.
export default defineConfig({
  test: {
    include: ['browser/**/*.test.ts'],
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

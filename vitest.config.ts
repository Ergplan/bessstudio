import { defineConfig } from 'vitest/config';

// The suite covers pure modules — catalogue, sizing, finance, quoting and the repository — so it
// needs no DOM and no Next.js build pipeline.
export default defineConfig({
  test: { include: ['src/tests/**/*.test.ts'], environment: 'node' },
});

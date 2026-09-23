import { defineConfig } from 'vitest/config';

/**
 * The case writer for the SAM cross-check. Separate from the default suite because it writes a
 * file rather than asserting anything, and because the other half of the comparison needs a 47 MB
 * Python dependency the unit suite must never require.
 */
export default defineConfig({
  test: { include: ['validation/*.test.ts'], environment: 'node' },
});

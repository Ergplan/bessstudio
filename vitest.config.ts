import { defineConfig } from 'vitest/config';

// The default suite covers pure modules — catalogue, sizing, finance, quoting, access rules and
// the repository — so it needs no DOM and no Next.js build pipeline.
//
// The Firestore rules suite is excluded from it because it needs the emulator running, and a
// suite that fails when a service is not up is a suite people learn to ignore. `npm run
// test:rules` starts the emulator around it.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/rules.test.ts', '**/node_modules/**'],
    environment: 'node',
  },
});

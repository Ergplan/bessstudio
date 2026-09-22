import { defineConfig } from 'vitest/config';

/** The rules suite alone, run inside `firebase emulators:exec`. */
export default defineConfig({
  test: {
    include: ['src/tests/rules.test.ts'],
    environment: 'node',
    // The emulator is a real service over the network; rules evaluation is slower than a unit test.
    testTimeout: 20000,
    hookTimeout: 40000,
    fileParallelism: false,
  },
});

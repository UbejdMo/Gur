import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text-summary', 'lcov'],
      // The rules are the heart of the game: CI fails if coverage drops below these.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});

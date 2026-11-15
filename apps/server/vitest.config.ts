import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests run against the engine's source, so they need no build and point at real lines.
    alias: { '@gur/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // index.ts only reads the port and starts listening.
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'lcov'],
      // The server decides who may do what: CI fails if coverage drops below these.
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});

import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the API client: a plain Node environment (no DOM), exercising
 * the transport, schema parsing, and SSE decoding as real code. Coverage is
 * opt-in via `--coverage` (v8); when enabled the thresholds fail the run on a
 * regression.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/test-*.{ts,tsx}',
        'src/**/index.ts',
        'src/**/*.d.ts',
      ],
      reporter: ['text'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 40,
        lines: 80,
      },
    },
  },
});

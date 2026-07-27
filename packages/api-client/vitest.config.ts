import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the API client: a plain Node environment (no DOM), exercising
 * the transport, schema parsing, and SSE decoding as real code. Coverage is
 * opt-in via `--coverage` (v8); when enabled the thresholds fail the run on a
 * regression.
 *
 * The thresholds sit just under what the suite actually achieves. A number far
 * below the measurement cannot fail: `functions: 40` against an actual 98.81 %
 * would still pass with three fifths of the client's functions untested.
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
        statements: 99,
        branches: 93,
        functions: 98,
        lines: 99,
      },
    },
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config: a jsdom DOM environment + React Testing Library, so this
 * package's components and hooks are exercised as real rendered DOM. CSS
 * side-effect imports are ignored (`css: false`). Coverage is opt-in via
 * `--coverage` (v8).
 *
 * Each threshold sits about two points under what the suite actually achieves,
 * not at a round number well below it. That headroom absorbs one newly uncovered
 * branch without breaking the build; losing a component's tests drops coverage
 * past the gate and fails the run.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    setupFiles: ['./src/test-setup.ts'],
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
        statements: 95,
        branches: 88,
        functions: 85,
        lines: 95,
      },
    },
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config: a jsdom DOM environment + React Testing Library, so this
 * package's components and hooks are exercised as real rendered DOM. CSS
 * side-effect imports are ignored (`css: false`). Coverage is opt-in via
 * `--coverage` (v8); when enabled the thresholds fail the run on a regression.
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
        statements: 90,
        branches: 80,
        functions: 75,
        lines: 90,
      },
    },
  },
});

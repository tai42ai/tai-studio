import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the SDK: a jsdom DOM environment + React Testing Library, so
 * the design-system components and hooks are exercised as real rendered DOM. CSS
 * side-effect imports are ignored (`css: false`) — the token contract is asserted
 * via `TOKEN_NAMES`, not computed styles. Coverage is opt-in via `--coverage`
 * (v8); when enabled the thresholds fail the run on a regression.
 *
 * The thresholds sit just under what the suite actually achieves, not at a round
 * number well below it. A global threshold with slack in it is a threshold a
 * whole component can slip through: at 85 % against an achieved ~97 %, three
 * published components could lose EVERY test they have and the gate would still
 * be green. The headroom is ~2 points — enough that adding an uncovered branch
 * is not a broken build, small enough that deleting a component's tests is.
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
        functions: 93,
        lines: 95,
      },
    },
  },
});

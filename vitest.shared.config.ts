import { fileURLToPath } from 'node:url';

/**
 * Settings every workspace package's vitest config reads, so the packages share these values.
 *
 * `TEST_TIMEOUT_MS` is the per-test budget: a hang detector, not a performance gate. The
 * tests wait on rendered state, never on a timer, so a test that reaches it is stuck. The
 * workspace runs its packages one at a time (`pnpm test`) and each package's Vitest pool
 * is sized to the machine's cores, so a test runs on about one core; the slowest test
 * measured that way on CI's 4-vCPU runner is 3.6 s (`features/conversations`
 * RouteFormDialog › "keeps the revealed secret on Escape, then closes only on the explicit
 * Done") and the budget is at least twice that, rounded up to a round number.
 */
export const TEST_TIMEOUT_MS = 20_000;

/**
 * The setup file every jsdom package runs before its own `src/test-setup.ts`: it sets
 * Testing Library's async-utility wait (and holds that measured value) once for the whole
 * workspace. It lives in the SDK package, which carries the Testing Library dependency it
 * imports; its `test-` name keeps it out of the SDK's build and published files, as every
 * `test-*` helper is.
 */
export const SHARED_TEST_SETUP = fileURLToPath(
  new URL('./packages/studio-sdk/src/test-shared-setup.ts', import.meta.url),
);

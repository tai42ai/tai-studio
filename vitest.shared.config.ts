import { fileURLToPath } from 'node:url';

/**
 * Settings every workspace package's vitest config reads, so the packages share these values.
 *
 * `TEST_TIMEOUT_MS` is the per-test time budget. The tests wait on rendered state, never on
 * a timer, so what the budget bounds is how long a test runs on a busy machine. Measured with
 * `pnpm -r test --coverage` on a 20-core host at load average 80-92: the slowest passing test
 * took 15.5 s (`features/hooks` RegisterHookForm, the jq condition and door-contract round
 * trip), and the first test in a file carries about 2.1 s of warm-up whatever it does
 * (`features/connectors` connection-detail: 2143 ms first, 326 ms for the same file's later
 * tests). 15.5 s + 2.1 s, rounded up.
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

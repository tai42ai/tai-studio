/**
 * The setup every jsdom package's vitest config runs before its own `src/test-setup.ts`
 * (wired through `SHARED_TEST_SETUP` in the repository's `vitest.shared.config.ts`): Testing
 * Library's async-utility wait, set once for the whole workspace. `configure` from
 * `@testing-library/react` writes the same config store `@testing-library/dom` reads, and
 * keeps the React `act` wrapper that package installs.
 */
import { configure } from '@testing-library/react';

/**
 * `ASYNC_UTIL_TIMEOUT_MS` is how long a Testing Library async utility (`findBy*`, `waitFor`)
 * waits for the rendered state it awaits. It sits below `TEST_TIMEOUT_MS` so a wait that
 * never resolves fails with the awaited query named, not with Vitest's bare timeout, and
 * above the slowest test measured on CI's 4-vCPU runner with packages run one at a time
 * (3.6 s, see `vitest.shared.config.ts`), which bounds every wait inside it.
 */
const ASYNC_UTIL_TIMEOUT_MS = 11_000;

configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

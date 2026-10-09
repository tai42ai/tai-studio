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
 * waits for the rendered state it awaits. Measured over every such wait of one
 * `pnpm -r test --coverage` run on a 20-core host at load average 80-92 (6198 waits): the
 * slowest took 7968 ms (studio-sdk JsonTree › "bounds expand-all by a total node budget on a
 * wide-and-deep payload"); add the 2.1 s first-test warm-up measured for `TEST_TIMEOUT_MS`
 * in `vitest.shared.config.ts`. 8.0 s + 2.1 s, rounded up.
 */
const ASYNC_UTIL_TIMEOUT_MS = 11_000;

configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

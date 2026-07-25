/**
 * `useOnUnauthorized` — the app's "the credential is dead, route to login" handler,
 * provided through an SDK-owned context so shared hooks can reach it without a
 * runtime dependency on the shell or the router.
 *
 * The default is a no-op, so a consumer rendered without a provider (a test, or a
 * plugin in isolation) still works — it just does not route. The shell wires the
 * real handler (the same one the api-client's 401 path drives) so a 401 raised
 * OUTSIDE TanStack Query — notably the raw interactions SSE fetch — lands on the
 * one login-routing path instead of being retried against a known-bad key.
 */
import { createContext, useContext } from 'react';

const UnauthorizedContext = createContext<() => void>(() => undefined);

export const UnauthorizedProvider = UnauthorizedContext.Provider;

export function useOnUnauthorized(): () => void {
  return useContext(UnauthorizedContext);
}

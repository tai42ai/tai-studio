/**
 * `useApi` — the typed client, provided through an SDK-owned React context.
 *
 * SDK boundary invariant: this context lives INSIDE the shared module set
 * (the SDK is a shared singleton across the plugin boundary), so a plugin calling
 * `useApi()` reaches the SAME client the shell built. It must NEVER wrap a
 * TanStack Query/Router context (those are deliberately NOT shared) — it stays a
 * plain typed client. The `ApiClient` type is imported type-only, so there is no
 * runtime dependency on @tai42/api-client (the SDK imports nothing internal at
 * runtime).
 */
import { createContext, useContext } from 'react';
import type { ApiClient } from '@tai42/api-client';

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext.Provider;

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (client === null) {
    throw new Error('useApi must be used within an <ApiProvider> (the shell provides it)');
  }
  return client;
}

export type { ApiClient };

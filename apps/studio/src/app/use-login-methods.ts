/**
 * Discover the deployment's sign-in methods (`GET /api/login/methods`). A plain fetch
 * with local state, NOT a TanStack query: the shell wipes the query cache around auth
 * flips and the login page renders inside that logged-out window, so a cache buys
 * nothing. The permanent key-paste fallback IS the recovery — no retry loop — and any
 * error is loud (the inline notice alone would discard the diagnostic).
 */
import { useApi } from '@tai42/studio-sdk';
import { useEffect, useState } from 'react';

import type { MethodsState } from './login-methods';

export function useLoginMethods(): MethodsState {
  const api = useApi();
  const [methods, setMethods] = useState<MethodsState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    api.getLoginMethods({ signal: controller.signal }).then(
      (data) => {
        setMethods({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setMethods({ status: 'failed' });
        console.error(error);
      },
    );
    return () => {
      controller.abort();
    };
  }, [api]);
  return methods;
}

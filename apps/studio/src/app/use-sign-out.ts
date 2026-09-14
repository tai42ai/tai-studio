/**
 * Sign-out: revoke the server-side session BEFORE clearing the local credential (the
 * revoke needs it), then clear UNCONDITIONALLY so a dead server never traps the user
 * signed in. A 404 is the expected answer for a plain API key (nothing to revoke) and
 * stays quiet; any other failure may mean a real accounts session did NOT revoke — so
 * it surfaces loudly (console.error) AND threads a one-shot notice onto the /login
 * screen the sign-out redirects to.
 */
import { useCallback } from 'react';
import { useApi, useAuth } from '@tai42/studio-sdk';
import { ApiError } from '@tai42/api-client';

import { SIGN_OUT_NOTICE_KEY } from './sign-out-notice';

export function useSignOut(): () => void {
  const { logout } = useAuth();
  const api = useApi();
  return useCallback(() => {
    async function run(): Promise<void> {
      try {
        await api.logout();
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) {
          console.error(error);
          try {
            globalThis.sessionStorage.setItem(SIGN_OUT_NOTICE_KEY, '1');
          } catch {
            // Storage unavailable — the console.error above stays the loud signal.
          }
        }
      } finally {
        logout();
      }
    }
    void run();
  }, [api, logout]);
}

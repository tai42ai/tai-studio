/**
 * Sign-out: revoke the server-side session BEFORE clearing the local credential (the
 * revoke needs it), then clear UNCONDITIONALLY so a dead server never traps the user
 * signed in. A 404 is the expected answer for a plain API key (nothing to revoke) and
 * stays quiet; any other failure may mean a real accounts session did NOT revoke — so
 * it surfaces loudly (console.error) AND threads a one-shot notice onto the /login
 * screen the sign-out redirects to. A result carrying `end_session_url` sends the whole
 * page to the identity provider's end-session URL after the local credential is cleared;
 * the provider returns the browser to `/login`.
 */
import { ApiError } from '@tai42/api-client';
import { useApi, useAuth } from '@tai42/studio-sdk';
import { useCallback } from 'react';

import { SIGN_OUT_NOTICE_KEY } from './sign-out-notice';

export function useSignOut(): () => void {
  const { logout } = useAuth();
  const api = useApi();
  return useCallback(() => {
    async function run(): Promise<void> {
      let endSessionUrl: string | null = null;
      try {
        endSessionUrl = (await api.logout()).end_session_url;
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
      if (endSessionUrl !== null) globalThis.location.assign(endSessionUrl);
    }
    void run();
  }, [api, logout]);
}

/**
 * The claim hand-off: a QR/onboarding link lands on `/login#claim=<token>`. Exchange
 * the one-time token for a session, then let the `isAuthenticated` effect navigate to
 * `returnTo`. The latch flips SYNCHRONOUSLY before the async exchange because the token
 * is single-use and burns server-side: a strict-mode double-invoke or a remount
 * mid-flight would otherwise fire a second exchange that 404s and paints failure over a
 * SUCCESSFUL login. The fragment is stripped immediately so the token never persists.
 * Returns the in-flight `claiming` flag for the busy indicator.
 */
import { useEffect, useRef, useState } from 'react';
import { useApi, useAuth } from '@tai42/studio-sdk';
import { ApiLoginFailedError } from '@tai42/api-client';

import { GENERIC_ERROR, readClaimToken } from './login-methods';

export function useClaimLogin({
  onError,
  onFailure,
}: {
  onError: (message: string) => void;
  /** Called when the exchange fails, so the caller can expand the key-paste fallback. */
  onFailure: () => void;
}): boolean {
  const api = useApi();
  const { login } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const claimExchanged = useRef(false);
  useEffect(() => {
    if (claimExchanged.current) return;
    const token = readClaimToken();
    if (token === null) return;
    claimExchanged.current = true;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setClaiming(true);
    void (async () => {
      try {
        const result = await api.claimLogin({ token });
        // Session-only by default (remember=false); the existing `isAuthenticated`
        // effect does the navigate, so the busy state stays up until this unmounts.
        login(result.token, false);
      } catch (error) {
        if (error instanceof ApiLoginFailedError) onError(error.message);
        else {
          onError(GENERIC_ERROR);
          console.error(error);
        }
        // The exchange failed — drop the busy state and let the caller expand the
        // key-paste fallback so the operator has an immediate recovery.
        setClaiming(false);
        onFailure();
      }
    })();
    // The latch guards re-execution; the effect runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return claiming;
}

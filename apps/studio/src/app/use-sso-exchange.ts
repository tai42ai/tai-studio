/**
 * The SSO hand-back: the OIDC callback route 302s to `/login?sso=<code>` after
 * minting a session server-side; exchange the one-time code for a token here, then
 * strip the param. A `useRef` latch runs the exchange exactly once — strict-mode's
 * double effect invoke would otherwise consume the single-use code twice and fail.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useApi, useAuth } from '@tai42/studio-sdk';
import { ApiLoginFailedError } from '@tai42/api-client';

import { GENERIC_ERROR } from './login-methods';

export function useSsoExchange({
  ssoCode,
  rememberRef,
  onError,
}: {
  ssoCode?: string;
  /** The live "remember on this device" state, read AT EXCHANGE COMPLETION so a toggle
   * made while the exchange POST was in flight is honored. */
  rememberRef: RefObject<boolean>;
  onError: (message: string) => void;
}): void {
  const api = useApi();
  const { login } = useAuth();
  const navigate = useNavigate();
  const ssoExchanged = useRef(false);
  useEffect(() => {
    if (ssoCode === undefined || ssoCode === '' || ssoExchanged.current) return;
    ssoExchanged.current = true;
    void (async () => {
      try {
        const result = await api.exchangeSsoCode(ssoCode);
        login(result.token, rememberRef.current);
      } catch (error) {
        if (error instanceof ApiLoginFailedError) onError(error.message);
        else {
          onError(GENERIC_ERROR);
          console.error(error);
        }
      } finally {
        // Drop `sso` (single-use, now consumed) while keeping `redirect`.
        void navigate({
          to: '/login',
          search: (prev) => ({ redirect: prev.redirect }),
          replace: true,
        });
      }
    })();
    // The latch guards re-execution; the effect intentionally runs on the mount
    // `ssoCode` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoCode]);
}

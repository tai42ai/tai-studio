/**
 * The one install / update call path (`POST /api/marketplace/install` or
 * `/update`), as a plain state machine through `useApi`. The ref is closed over;
 * the caller supplies the rest of the body.
 */
import type { MarketplaceInstallBody, MarketplaceInstallResult } from '@tai42/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from '../hooks/useApi';

export type InstallActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'done'; readonly result: MarketplaceInstallResult }
  | { readonly status: 'failed'; readonly error: unknown };

export interface InstallAction {
  readonly state: InstallActionState;
  /** Resolves with the receipt; rejects with the server error after recording `failed`. */
  readonly run: (body: Omit<MarketplaceInstallBody, 'ref'>) => Promise<MarketplaceInstallResult>;
  /** Back to `idle`. */
  readonly reset: () => void;
}

export function useInstallAction(refValue: string, verb: 'Install' | 'Update'): InstallAction {
  const api = useApi();
  const [state, setState] = useState<InstallActionState>({ status: 'idle' });
  // A reply landing after unmount must not set state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (body: Omit<MarketplaceInstallBody, 'ref'>): Promise<MarketplaceInstallResult> => {
      setState({ status: 'pending' });
      try {
        const result =
          verb === 'Install'
            ? await api.installMarketplacePlugin({ ref: refValue, ...body })
            : await api.updateMarketplacePlugin({ ref: refValue, ...body });
        if (mountedRef.current) setState({ status: 'done', result });
        return result;
      } catch (error: unknown) {
        if (mountedRef.current) setState({ status: 'failed', error });
        throw error;
      }
    },
    [api, refValue, verb],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}

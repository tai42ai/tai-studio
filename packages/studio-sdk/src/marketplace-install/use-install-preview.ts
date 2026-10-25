/**
 * The install preview (`POST /api/marketplace/install/preview`) as a plain fetch state
 * machine through `useApi`: the SDK holds no query context, so each request gets its
 * own `AbortController`, aborted when the request changes and on unmount. No retry,
 * no cache.
 */
import type { MarketplaceInstallPreview } from '@tai42/api-client';
import { useCallback, useEffect, useState } from 'react';

import { useApi } from '../hooks/useApi';

/** What a preview is asked for; `null` keeps the hook idle. */
export interface InstallPreviewRequest {
  readonly ref: string;
  readonly version: string | null;
  readonly route_mounts?: Record<string, string>;
}

export type InstallPreviewState =
  | { readonly status: 'loading'; readonly previous: MarketplaceInstallPreview | null }
  | { readonly status: 'ready'; readonly preview: MarketplaceInstallPreview }
  | { readonly status: 'failed'; readonly error: unknown };

/**
 * Fire the preview whenever the serialized request changes. While a re-preview
 * loads, `previous` keeps the last ready preview so the form does not blank on every
 * edit; a failure clears it.
 */
export function useInstallPreview(request: InstallPreviewRequest | null): {
  readonly state: InstallPreviewState;
  readonly refetch: () => void;
} {
  const api = useApi();
  const [state, setState] = useState<InstallPreviewState>({ status: 'loading', previous: null });
  const [attempt, setAttempt] = useState(0);
  const requestKey = request === null ? null : JSON.stringify(request);

  useEffect(() => {
    if (requestKey === null) return;
    const body = JSON.parse(requestKey) as InstallPreviewRequest;
    const controller = new AbortController();
    setState((prev) => ({
      status: 'loading',
      previous:
        prev.status === 'ready' ? prev.preview : prev.status === 'loading' ? prev.previous : null,
    }));
    api
      .previewMarketplaceInstall(
        {
          ref: body.ref,
          version: body.version ?? undefined,
          ...(body.route_mounts !== undefined ? { route_mounts: body.route_mounts } : {}),
        },
        controller.signal,
      )
      .then(
        (preview) => {
          if (!controller.signal.aborted) setState({ status: 'ready', preview });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState({ status: 'failed', error });
        },
      );
    return () => {
      controller.abort();
    };
  }, [api, requestKey, attempt]);

  const refetch = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return { state, refetch };
}

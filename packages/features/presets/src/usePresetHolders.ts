/**
 * The holders that block one action on a preset, read on open for the rename and
 * delete dialogs. The read runs only when the caller's projection reaches the preview
 * route; a refusal at submit that names holders replaces the preview and invalidates
 * it, so the next open reads afresh.
 */
import { apiRoutes, type PresetHolderAction, type ReferenceHolder } from '@tai42/api-client';
import {
  coversAnyRoute,
  type HolderPreviewState,
  isFullProjection,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { presetRefereesKey } from './keys';

const PREVIEW_ROUTE = apiRoutes.get_api_presets_name_referees.path;

export const PRESET_PREVIEW_NO_GRANT =
  'Checking what still uses this is outside your access — it needs read access to presets.';

export interface PresetHolders {
  readonly state: HolderPreviewState;
  /** The preview to show after a refused action: its holders, when the refusal names them. */
  readonly afterRefusal: (error: unknown) => HolderPreviewState;
  /** Drop the read preview, so the next open reads afresh (called on a refusal). */
  readonly invalidate: () => void;
}

export function usePresetHolders(name: string, action: PresetHolderAction): PresetHolders {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state: capabilities } = useCapabilities();
  const granted =
    capabilities.status === 'ready' &&
    (isFullProjection(capabilities.projection) ||
      coversAnyRoute(capabilities.projection, [PREVIEW_ROUTE]));
  const query = useQuery({
    queryKey: presetRefereesKey(name, action),
    queryFn: ({ signal }) => api.getPresetReferees(name, action, signal),
    enabled: granted,
  });

  let state: HolderPreviewState;
  if (capabilities.status === 'loading') state = { status: 'loading' };
  else if (capabilities.status === 'failed') state = { status: 'error', error: capabilities.error };
  else if (!granted) state = { status: 'no-grant', message: PRESET_PREVIEW_NO_GRANT };
  else if (query.isError) state = { status: 'error', error: query.error };
  else if (query.data === undefined) state = { status: 'loading' };
  else state = { status: 'ready', holders: query.data.holders };

  const afterRefusal = (error: unknown): HolderPreviewState => {
    const holders = api.holdersFromError(error);
    return holders === null ? state : { status: 'ready', holders };
  };
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: presetRefereesKey(name, action) });
  }, [queryClient, name, action]);
  return { state, afterRefusal, invalidate };
}

/** The first line of an error's message when the refusal names holders (they show in the
 * list, not here); the whole message otherwise. */
export function refusalHeadline(
  holders: readonly ReferenceHolder[] | null,
  message: string,
): string {
  return holders === null ? message : (message.split('\n')[0] ?? message);
}

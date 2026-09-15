/**
 * The selected tool's extension-combo state: the tool's authored combos + catalog, the
 * preset list (which only IDENTIFIES preset-authored tools — its failure never walls
 * the card), the save mutation that writes every combo at once, and the editor
 * draft/open/confirm-clear state. Saving an empty list clears the combos behind a
 * confirm; a save invalidates the tool's combos, the extension catalog, and the tool
 * list (a combo change binds or tears down branch tools).
 */
import type { ApiClient, PresetExtensionElement } from '@tai42/api-client';
import { extensionsQueryKey, useApi } from '@tai42/studio-sdk';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';

import { toolExtensionsKey, toolPresetsKey, toolsListKey } from './keys';

type ToolExtensionsData = Awaited<ReturnType<ApiClient['getToolExtensions']>>;
type SetExtensionsResult = Awaited<ReturnType<ApiClient['setToolExtensions']>>;
type PresetList = Awaited<ReturnType<ApiClient['listPresets']>>;

export interface ToolExtensionsController {
  readonly extensionsQuery: UseQueryResult<ToolExtensionsData>;
  readonly presetsQuery: UseQueryResult<PresetList>;
  readonly save: UseMutationResult<SetExtensionsResult, Error, PresetExtensionElement[][]>;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly draft: PresetExtensionElement[][];
  readonly setDraft: (draft: PresetExtensionElement[][]) => void;
  readonly confirmingClear: boolean;
  readonly setConfirmingClear: (value: boolean) => void;
  readonly isPresetTool: boolean;
  readonly openEditor: (combos: readonly PresetExtensionElement[][]) => void;
  readonly onSave: () => void;
}

export function useToolExtensions(tool: string): ToolExtensionsController {
  const api = useApi();
  const queryClient = useQueryClient();

  const extensionsQuery = useQuery({
    queryKey: toolExtensionsKey(tool),
    queryFn: ({ signal }) => api.getToolExtensions(tool, signal),
  });
  const presetsQuery = useQuery({
    queryKey: toolPresetsKey,
    queryFn: ({ signal }) => api.listPresets(signal),
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PresetExtensionElement[][]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const save = useMutation({
    mutationFn: (combos: PresetExtensionElement[][]) => api.setToolExtensions(tool, combos),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolExtensionsKey(tool) });
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      setOpen(false);
    },
  });

  const openEditor = (combos: readonly PresetExtensionElement[][]): void => {
    setDraft(combos.map((combo) => [...combo]));
    setConfirmingClear(false);
    save.reset();
    setOpen(true);
  };

  const onSave = (): void => {
    if (draft.length === 0 && !confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    save.mutate(draft);
  };

  // A non-conflicted preset owns its extensions through the presets API; the manifest
  // route rejects it. With no preset info (a failed/uncovered presets read), treat the
  // tool as a manifest tool so the editor stays available rather than walling the card.
  const isPresetTool =
    presetsQuery.data?.some((row) => row.name === tool && !row.conflicted) ?? false;

  return {
    extensionsQuery,
    presetsQuery,
    save,
    open,
    setOpen,
    draft,
    setDraft,
    confirmingClear,
    setConfirmingClear,
    isPresetTool,
    openEditor,
    onSave,
  };
}

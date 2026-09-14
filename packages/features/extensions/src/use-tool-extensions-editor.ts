/**
 * The view-model for the tool-extensions combo-list editor: the catalog/combos
 * queries, the editable working copy, and the save mutation — plus the pure combo
 * updaters the row controls drive.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toolsListKey, useApi } from '@tai42/studio-sdk';
import type { PresetExtensionElement } from '@tai42/api-client';

import { applyToolsKey, comboLoadKey, extensionsQueryKey, type ToolExtensionsOrigin } from './keys';

type Combos = PresetExtensionElement[][];

/** Replace the combo at `index` with `next`, preserving order. */
export function applyComboChange(
  combos: Combos,
  index: number,
  next: PresetExtensionElement[],
): Combos {
  return combos.map((existing, i) => (i === index ? next : existing));
}

/** Drop the combo at `index`. */
export function removeCombo(combos: Combos, index: number): Combos {
  return combos.filter((_, i) => i !== index);
}

/** Move the combo at `index` one position earlier (no-op at the top). */
export function moveComboUp(combos: Combos, index: number): Combos {
  if (index === 0) return combos;
  const next = [...combos];
  [next[index - 1], next[index]] = [next[index], next[index - 1]] as [
    PresetExtensionElement[],
    PresetExtensionElement[],
  ];
  return next;
}

/** Move the combo at `index` one position later (no-op at the bottom). */
export function moveComboDown(combos: Combos, index: number): Combos {
  if (index === combos.length - 1) return combos;
  const next = [...combos];
  [next[index], next[index + 1]] = [next[index + 1], next[index]] as [
    PresetExtensionElement[],
    PresetExtensionElement[],
  ];
  return next;
}

export function useToolExtensionsEditor(tool: string, origin: ToolExtensionsOrigin) {
  const api = useApi();
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: extensionsQueryKey,
    queryFn: ({ signal }) => api.listExtensions(signal),
  });

  const combosQuery = useQuery<Combos>({
    queryKey: comboLoadKey(origin, tool),
    queryFn:
      origin === 'manifest'
        ? async ({ signal }) => (await api.getToolExtensions(tool, signal)).combos
        : // A preset combo element is a bare name or a `{name, config}` mapping; the
          // FULL elements are kept so a combo's author `config` can be rehydrated on
          // save (the name-only editor below shows only names).
          async ({ signal }) => (await api.getPreset(tool, signal)).extensions,
  });

  // The local, editable working copy — a deep clone seeded from the loaded combos
  // so edits never mutate the query cache. `null` until the load lands. Seeded ONCE
  // per mount: this editor is remounted per (origin, tool) by its `key`, so a fresh
  // tool re-seeds, while a background refetch (window focus/reconnect) must never
  // overwrite in-progress edits with the server copy and silently discard them.
  const [combos, setCombos] = useState<Combos | null>(null);
  useEffect(() => {
    if (combos === null && combosQuery.data !== undefined) {
      setCombos(combosQuery.data.map((combo) => [...combo]));
    }
  }, [combos, combosQuery.data]);

  const save = useMutation({
    mutationFn: async (next: Combos): Promise<void> => {
      // The combos are config-bearing end to end (a surviving element keeps its author
      // `config` through an edit), so the edited value is written back as-is.
      if (origin === 'manifest') {
        await api.setToolExtensions(tool, next);
      } else {
        await api.savePresetVersion(tool, { extensions: next });
      }
    },
    onSuccess: () => {
      // A combo save rebinds/tears the per-combo BRANCH tools, so several views shift at
      // once: this panel's combo load + tool picker, the extension-catalog families on
      // this same page, and the registered-tool master list. Invalidate all of them so
      // every dependent view refetches — the same catalog + tool-list refresh the
      // tools-page extensions card performs.
      void queryClient.invalidateQueries({ queryKey: comboLoadKey(origin, tool) });
      void queryClient.invalidateQueries({ queryKey: applyToolsKey });
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
    },
  });

  const changeCombo = useCallback((index: number, next: PresetExtensionElement[]) => {
    setCombos((prev) => (prev === null ? prev : applyComboChange(prev, index, next)));
  }, []);
  const dropCombo = useCallback((index: number) => {
    setCombos((prev) => (prev === null ? prev : removeCombo(prev, index)));
  }, []);
  const shiftComboUp = useCallback((index: number) => {
    setCombos((prev) => (prev === null ? prev : moveComboUp(prev, index)));
  }, []);
  const shiftComboDown = useCallback((index: number) => {
    setCombos((prev) => (prev === null ? prev : moveComboDown(prev, index)));
  }, []);
  const addCombo = useCallback(() => {
    setCombos((prev) => (prev === null ? prev : [...prev, []]));
  }, []);

  return {
    catalogQuery,
    combosQuery,
    combos,
    save,
    changeCombo,
    dropCombo,
    shiftComboUp,
    shiftComboDown,
    addCombo,
  };
}

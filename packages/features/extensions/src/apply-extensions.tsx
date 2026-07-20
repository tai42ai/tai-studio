/**
 * The "apply an extension to a tool" surface. A `ToolPicker` selects a tool; its
 * current extension combos load; a COMBO-LIST editor (one `ExtensionPicker` per
 * combo row, with add / remove / reorder) authors the FULL lossless list; save
 * writes it back. The picker and combo-list editor are SHARED across both tool
 * origins — only the read/write path branches:
 *
 *  - MANIFEST tool (provided by a `tools`/`mcp` config) — read via
 *    `getToolExtensions`, write the full `{combos}` via `setToolExtensions` (the
 *    manifest is the single source of truth; an empty list clears).
 *  - PRESET tool (its name matches a preset row) — read the ACTIVE version's
 *    combos from `getPreset(...).extensions`, write via
 *    `savePresetVersion(name, {extensions})` — extensions ALONE, so the
 *    save-version sentinels carry `fixed_kwargs`/`tags` forward. NEVER the manifest
 *    route (which correctly raises for a preset tool). A `conflicted: true` preset
 *    is excluded from the preset branch (delete-only) — if its name is a foreign
 *    live tool it is served by the manifest branch instead.
 *
 * A save error (e.g. a slipped-through invalid combo the server rejects 400/409)
 * is surfaced LOUDLY as ESCAPED text, never swallowed. Every server-supplied string
 * renders as text through the DS components (React escapes it) — no HTML sink.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Extension, PresetExtensionElement, PresetRecord } from '@tai42/api-client';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ExtensionPicker,
  Field,
  Skeleton,
  Spinner,
  ToolPicker,
  comboElementNames,
  errorMessage,
  extensionElementName,
  toolsListKey,
  useApi,
} from '@tai42/studio-sdk';

import {
  applyPresetsKey,
  applyToolsKey,
  comboLoadKey,
  extensionsQueryKey,
  type ToolExtensionsOrigin,
} from './keys';

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  font: 'var(--tai-text-lg) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  padding: 'var(--tai-space-3)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
};

const rowHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  flexWrap: 'wrap',
};

const monoStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-mono)',
  color: 'var(--tai-color-text)',
};

/** The branch tool a combo produces (`weather` + `["chain","batch"]` → `weather_chain_batch`). */
function branchToolName(tool: string, combo: readonly PresetExtensionElement[]): string | null {
  return combo.length === 0 ? null : `${tool}_${comboElementNames(combo).join('_')}`;
}

/**
 * Rebuild a combo's config-bearing elements after a name-only edit in the picker.
 * A name that survives keeps its element verbatim (preserving any author `config`);
 * a newly-added name becomes a bare-name element. Order follows the edited names.
 */
function reconcileCombo(
  names: readonly string[],
  existing: readonly PresetExtensionElement[],
): PresetExtensionElement[] {
  const byName = new Map<string, PresetExtensionElement>();
  for (const element of existing) byName.set(extensionElementName(element), element);
  return names.map((name) => byName.get(name) ?? name);
}

/** One editable combo row: its branch-tool preview, reorder/remove controls, and its picker. */
function ComboRow({
  tool,
  combo,
  index,
  total,
  available,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  readonly tool: string;
  readonly combo: readonly PresetExtensionElement[];
  readonly index: number;
  readonly total: number;
  readonly available: readonly Extension[];
  readonly disabled: boolean;
  readonly onChange: (next: PresetExtensionElement[]) => void;
  readonly onRemove: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
}): ReactNode {
  const branch = branchToolName(tool, combo);
  // The picker is name-only; project the combo's elements to their names and
  // reconcile the edited names back to config-bearing elements on change.
  const names = comboElementNames(combo);
  return (
    <div style={rowStyle} data-testid={`combo-row-${String(index)}`}>
      <div style={rowHeaderStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          <strong>Combo {index + 1}</strong>
          {branch !== null ? (
            <Badge variant="primary">
              <span style={monoStyle}>{branch}</span>
            </Badge>
          ) : (
            <span style={{ color: 'var(--tai-color-text-muted)' }}>
              Pick at least one extension.
            </span>
          )}
        </span>
        <span style={{ display: 'inline-flex', gap: 'var(--tai-space-2)' }}>
          <Button
            aria-label={`Move combo ${String(index + 1)} up`}
            disabled={disabled || index === 0}
            onClick={onMoveUp}
          >
            ↑
          </Button>
          <Button
            aria-label={`Move combo ${String(index + 1)} down`}
            disabled={disabled || index === total - 1}
            onClick={onMoveDown}
          >
            ↓
          </Button>
          <Button
            variant="danger"
            aria-label={`Remove combo ${String(index + 1)}`}
            disabled={disabled}
            onClick={onRemove}
          >
            Remove
          </Button>
        </span>
      </div>
      <ExtensionPicker
        available={available}
        value={names}
        onChange={(nextNames) => {
          onChange(reconcileCombo(nextNames, combo));
        }}
        disabled={disabled}
        idPrefix={`extension-picker-${String(index)}`}
      />
    </div>
  );
}

/** The combo-list editor + save, for one tool of a known origin. */
function ToolExtensionsEditor({
  tool,
  origin,
}: {
  readonly tool: string;
  readonly origin: ToolExtensionsOrigin;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: extensionsQueryKey,
    queryFn: ({ signal }) => api.listExtensions(signal),
  });

  const combosQuery = useQuery<PresetExtensionElement[][]>({
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
  const [combos, setCombos] = useState<PresetExtensionElement[][] | null>(null);
  useEffect(() => {
    if (combos === null && combosQuery.data !== undefined) {
      setCombos(combosQuery.data.map((combo) => [...combo]));
    }
  }, [combos, combosQuery.data]);

  const save = useMutation({
    mutationFn: async (next: PresetExtensionElement[][]): Promise<void> => {
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

  // Error states first — a rejected load (or a zod mismatch) must surface LOUDLY
  // and never be masked by the `combos === null` (not-yet-seeded) loading guard.
  if (catalogQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(catalogQuery.error)}
        onRetry={() => void catalogQuery.refetch()}
      />
    );
  }
  if (combosQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(combosQuery.error)}
        onRetry={() => void combosQuery.refetch()}
      />
    );
  }
  if (catalogQuery.isPending || combosQuery.isPending || combos === null) {
    return (
      <div
        data-testid="combos-loading"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
      >
        <Skeleton height={28} />
        <Skeleton height={64} />
      </div>
    );
  }

  const available = catalogQuery.data;
  const update = (next: PresetExtensionElement[][]): void => {
    setCombos(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {combos.length === 0 ? (
        <EmptyState
          title="No extensions applied"
          description={`${tool} carries no extension combos. Add one to compose a branch tool.`}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          {combos.map((combo, index) => (
            <ComboRow
              // The index IS the identity here: rows are an ordered list the user
              // reorders, and a combo has no stable id of its own.
              key={index}
              tool={tool}
              combo={combo}
              index={index}
              total={combos.length}
              available={available}
              disabled={save.isPending}
              onChange={(next) => {
                update(combos.map((existing, i) => (i === index ? next : existing)));
              }}
              onRemove={() => {
                update(combos.filter((_, i) => i !== index));
              }}
              onMoveUp={() => {
                if (index === 0) return;
                const next = [...combos];
                [next[index - 1], next[index]] = [next[index], next[index - 1]] as [
                  PresetExtensionElement[],
                  PresetExtensionElement[],
                ];
                update(next);
              }}
              onMoveDown={() => {
                if (index === combos.length - 1) return;
                const next = [...combos];
                [next[index], next[index + 1]] = [next[index + 1], next[index]] as [
                  PresetExtensionElement[],
                  PresetExtensionElement[],
                ];
                update(next);
              }}
            />
          ))}
        </div>
      )}

      {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}

      <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
        <Button
          disabled={save.isPending}
          onClick={() => {
            update([...combos, []]);
          }}
        >
          Add combo
        </Button>
        <Button
          variant="primary"
          disabled={save.isPending}
          onClick={() => {
            save.mutate(combos);
          }}
        >
          {save.isPending ? <Spinner label="Saving extensions" /> : null}
          Save extensions
        </Button>
      </div>
    </div>
  );
}

export function ApplyExtensionsPanel(): ReactNode {
  const api = useApi();

  const toolsQuery = useQuery({
    queryKey: applyToolsKey,
    queryFn: ({ signal }) => api.listTools(signal),
  });
  const presetsQuery = useQuery({
    queryKey: applyPresetsKey,
    queryFn: ({ signal }) => api.listPresets(signal),
  });

  const [selected, setSelected] = useState<string | null>(null);

  const presetsByName = useMemo(() => {
    const map = new Map<string, PresetRecord>();
    for (const row of presetsQuery.data ?? []) map.set(row.name, row);
    return map;
  }, [presetsQuery.data]);

  const presetRow = selected === null ? undefined : presetsByName.get(selected);
  // A non-conflicted preset row owns its extensions through the presets API; a
  // conflicted row is excluded (it is either a foreign live tool the manifest
  // branch serves, or unregistered) so it falls through to the manifest branch.
  const editablePreset = presetRow !== undefined && !presetRow.conflicted;
  const origin: ToolExtensionsOrigin = editablePreset ? 'preset' : 'manifest';

  let body: ReactNode;
  if (selected === null) {
    body = (
      <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
        Select a tool to view and edit its extension combos.
      </p>
    );
  } else {
    body = <ToolExtensionsEditor key={`${origin}:${selected}`} tool={selected} origin={origin} />;
  }

  return (
    <Card>
      <div style={panelStyle} data-testid="apply-extensions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
          <h2 style={headingStyle}>Apply an extension to a tool</h2>
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            Attach a clip-on power (chain / batch / monitor / …) to a tool. Manifest tools sync to
            the manifest; a preset tool is authored through its preset spec.
          </p>
        </div>

        {toolsQuery.isError ? (
          <ErrorState
            message={errorMessage(toolsQuery.error)}
            onRetry={() => void toolsQuery.refetch()}
          />
        ) : presetsQuery.isError ? (
          <ErrorState
            message={errorMessage(presetsQuery.error)}
            onRetry={() => void presetsQuery.refetch()}
          />
        ) : (
          <Field label="Tool">
            <ToolPicker
              toolNames={toolsQuery.data ?? []}
              value={selected}
              onChange={setSelected}
              disabled={toolsQuery.isPending || presetsQuery.isPending}
              placeholder={toolsQuery.isPending ? 'Loading tools…' : 'Select a tool…'}
            />
          </Field>
        )}

        {selected !== null && editablePreset ? (
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            <Badge variant="success">preset</Badge> Authored through the preset spec (a new version
            is saved).
          </p>
        ) : null}

        {body}
      </div>
    </Card>
  );
}

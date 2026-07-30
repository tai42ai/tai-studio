/**
 * The extension-combo authoring surface for the SELECTED tool. A manifest tool's
 * `extensions` map is the single source of truth for the clip-on powers
 * (chain / batch / monitor / …) it carries; this card reads the tool's authored
 * combos and its extension catalog (`getToolExtensions`), shows the current combos
 * as ordered `Badge` rows, and opens a `Dialog` mounting the shared SDK
 * `ExtensionComboBuilder` to author the FULL list. Save writes every combo at once
 * (`setToolExtensions`); an empty list CLEARS them (dropping all the tool's branch
 * tools) behind a confirm.
 *
 * A tool's combos may carry author config (`{ name, config }` elements — an
 * `output_schema` extension carries its schema this way), so the builder's `value` is
 * the config-bearing list seeded directly from the loaded combos and its `onChange`
 * output is sent back unchanged; the read-only rows show each combo's element names.
 *
 * A PRESET tool is provided by no manifest config, so the manifest route rejects
 * it: when the selected tool's name matches a (non-conflicted) preset, the card
 * shows a static hint linking to the presets page instead of the editor — keyed
 * off the preset list, never by string-matching a server error. That preset read is
 * best-effort: a scoped tools-caller that cannot reach `/api/presets` (or any presets
 * error) has no preset info, so the card falls through to the manifest editor path
 * rather than walling — only the tool's own extensions read is load-bearing. The
 * failure is still STATED, with a retry: without preset info a preset tool looks
 * like a manifest tool, so the editor on offer is one the manifest route rejects.
 *
 * Every 400/409 the server raises on save renders VERBATIM in the dialog (no 4xx
 * special-casing); server-supplied strings render as escaped text through the DS
 * components. A zod mismatch or a rejected extensions load surfaces as a loud
 * `ErrorState`.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { summarizeFleetFanout, type PresetExtensionElement } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  ExtensionComboBuilder,
  FleetReport,
  Skeleton,
  Spinner,
  comboElementNames,
  errorMessage,
  extensionsQueryKey,
  useApi,
} from '@tai42/studio-sdk';

import { toolExtensionsKey, toolPresetsKey, toolsListKey } from './keys';

/** A single authored combo, shown as an ordered row of extension-name badges. */
function ComboBadges({ combo }: { readonly combo: readonly string[] }): ReactNode {
  return (
    <span className="tai-row">
      {combo.map((name, position) => (
        <span key={`${name}-${String(position)}`} className="tai-row">
          {position > 0 ? (
            <span aria-hidden className="tai-muted">
              +
            </span>
          ) : null}
          <Badge variant="primary">{name}</Badge>
        </span>
      ))}
    </span>
  );
}

export function ToolExtensionsCard({ tool }: { readonly tool: string }): ReactNode {
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
      // A combo change binds or tears down BRANCH tools, so the tool list and the
      // extension catalog both shift alongside this tool's own combos — invalidate
      // all three so every dependent view refetches.
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

  // The extensions read is this card's own data: a rejected load surfaces LOUDLY
  // before the pending skeleton, so an error is never masked while the presets query
  // is still in flight.
  if (extensionsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(extensionsQuery.error)}
        onRetry={() => void extensionsQuery.refetch()}
      />
    );
  }
  // The presets read only IDENTIFIES which tools are preset-authored (its result
  // flips the editor to a hint); wait for it while it is genuinely loading, but a
  // FAILED presets read is NOT walled — a scoped tools-caller that cannot reach
  // `/api/presets` (or any presets error) falls through to the manifest path with a
  // working card below, under the loud notice the card renders for that failure.
  if (extensionsQuery.isPending || presetsQuery.isPending) {
    return (
      <div className="tai-stack">
        <Skeleton height={20} width="40%" />
        <Skeleton height={48} />
      </div>
    );
  }

  // A non-conflicted preset row owns its extensions through the presets API; the
  // manifest route rejects it. A conflicted row is a foreign live tool (or
  // unregistered), so it is authored here through the manifest path like any tool.
  // With no preset info (a failed/uncovered presets read), treat the tool as a
  // manifest tool so the editor stays available rather than walling the card.
  const isPresetTool =
    presetsQuery.data?.some((row) => row.name === tool && !row.conflicted) ?? false;
  const { combos, available } = extensionsQuery.data;

  return (
    <section className="tai-stack" aria-labelledby="tool-extensions-heading">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          flexWrap: 'wrap',
        }}
      >
        <h3 id="tool-extensions-heading" className="tai-card-title">
          Extension combos
        </h3>
        {!isPresetTool ? (
          <Button
            type="button"
            onClick={() => {
              openEditor(combos);
            }}
          >
            Edit combos
          </Button>
        ) : null}
      </div>

      {/* The presets read is not load-bearing, so its failure does not wall the card
          — but it must not pass silently either: with no preset info a PRESET tool is
          indistinguishable from a manifest tool, so the card offers an editor whose
          save the manifest route will reject. State the failure and offer the retry
          that restores the distinction. */}
      {presetsQuery.isError ? (
        <ErrorState
          message={`Preset tools cannot be identified: ${errorMessage(presetsQuery.error)}`}
          onRetry={() => void presetsQuery.refetch()}
        />
      ) : null}

      {save.isSuccess ? (
        <>
          <p role="status" className="tai-status-ok" style={{ margin: 0 }}>
            Extensions applied.
          </p>
          {/* The save persists then broadcasts a reload to the fleet; the shared
              handler renders any failed propagation honestly (nothing on a
              converged / lone-worker apply). */}
          <FleetReport summary={summarizeFleetFanout(save.data.fanout)} />
        </>
      ) : null}

      {isPresetTool ? (
        <p className="tai-muted" style={{ margin: 0 }}>
          <Badge variant="success">preset</Badge> Preset tools carry their combos on the preset —{' '}
          {/* The link names itself from its own visible text (WCAG 2.5.3, Label in
              Name): an `aria-label` naming the tool and the destination said none of
              the words the link shows. */}
          <AppLink to="presets" search={{ preset: tool }}>
            manage {tool} on the presets page
          </AppLink>
          .
        </p>
      ) : combos.length === 0 ? (
        <EmptyState
          title="No extension combos"
          description={`${tool} carries no extension combos. Add one to compose a branch tool.`}
        />
      ) : (
        <div className="tai-stack tai-stack-2">
          {combos.map((combo, index) => (
            // The index IS the identity: combos are an ordered list with no stable id
            // of their own, read-only here (the dialog owns editing). The row shows the
            // element names; any author config is edited in the dialog.
            <div key={index} className="tai-row">
              <ComboBadges combo={comboElementNames(combo)} />
            </div>
          ))}
        </div>
      )}

      <Dialog
        title={`Edit extension combos — ${tool}`}
        description="Author the full list of extension combos for this tool. Each combo composes a branch tool; saving replaces the whole list."
        open={open}
        onOpenChange={(next) => {
          if (save.isPending) return;
          setOpen(next);
        }}
      >
        <div className="tai-stack">
          <ExtensionComboBuilder
            available={available}
            value={draft}
            onChange={(next) => {
              setConfirmingClear(false);
              setDraft(next);
            }}
            disabled={save.isPending}
            idPrefix="tool-extensions-combo-builder"
            // The catalog is already resolved here (the card gates on it), so the
            // no-flash rule holds: the builder never flags an unknown name pre-resolve.
            availableReady={extensionsQuery.isSuccess}
          />

          {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}

          {confirmingClear ? (
            <p role="alert" className="tai-status-err" style={{ margin: 0 }}>
              Saving an empty list clears every combo and drops all of {tool}&apos;s branch tools.
              Confirm to proceed.
            </p>
          ) : null}

          <div className="tai-row">
            <Button type="button" variant="primary" disabled={save.isPending} onClick={onSave}>
              {save.isPending ? <Spinner label="Saving extensions" /> : null}
              {confirmingClear ? 'Confirm clear' : 'Save'}
            </Button>
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

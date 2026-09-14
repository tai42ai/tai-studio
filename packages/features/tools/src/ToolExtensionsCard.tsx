/**
 * The extension-combo authoring surface for the SELECTED tool. A manifest tool's
 * `extensions` map is the single source of truth for its clip-on powers; this card
 * reads the tool's authored combos and its extension catalog (see
 * {@link useToolExtensions}), shows the current combos as ordered `Badge` rows, and
 * opens a `Dialog` mounting the shared `ExtensionComboBuilder` to author the FULL list.
 * Save writes every combo at once; an empty list CLEARS them behind a confirm.
 *
 * A PRESET tool is provided by no manifest config, so the card shows a static hint
 * linking to the presets page instead of the editor — keyed off the preset list, never
 * by string-matching a server error. The preset read is best-effort: its failure is
 * STATED with a retry, and the card falls through to the manifest editor rather than
 * walling. Every 400/409 on save renders VERBATIM in the dialog.
 */
import type { ReactNode } from 'react';
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
} from '@tai42/studio-sdk';

import { useToolExtensions, type ToolExtensionsController } from './useToolExtensions';

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

/** The read-only body: the preset hint, the empty state, or the ordered combo rows. */
function CombosView({
  tool,
  isPresetTool,
  combos,
}: {
  readonly tool: string;
  readonly isPresetTool: boolean;
  readonly combos: readonly (readonly PresetExtensionElement[])[];
}): ReactNode {
  if (isPresetTool) {
    return (
      <p className="tai-muted" style={{ margin: 0 }}>
        <Badge variant="success">preset</Badge> Preset tools carry their extension sets on the
        preset —{' '}
        <AppLink to="presets" search={{ preset: tool }}>
          manage {tool} on the presets page
        </AppLink>
        .
      </p>
    );
  }
  if (combos.length === 0) {
    return (
      <EmptyState
        title="No extension sets"
        description={`${tool} carries no extension sets. Add one to compose a branch tool.`}
      />
    );
  }
  return (
    <div className="tai-stack tai-stack-2">
      {combos.map((combo, index) => (
        // The index IS the identity: combos are an ordered list with no stable id of
        // their own, read-only here (the dialog owns editing).
        <div key={index} className="tai-row">
          <ComboBadges combo={comboElementNames(combo)} />
        </div>
      ))}
    </div>
  );
}

/** The full-list editor dialog: the shared combo builder, the clear confirm, and Save. */
function EditExtensionsDialog({
  tool,
  ext,
  available,
  availableReady,
}: {
  readonly tool: string;
  readonly ext: ToolExtensionsController;
  readonly available: Parameters<typeof ExtensionComboBuilder>[0]['available'];
  readonly availableReady: boolean;
}): ReactNode {
  const { save } = ext;
  return (
    <Dialog
      title={`Edit extension sets — ${tool}`}
      description="Author the full list of extension sets for this tool. Each extension set composes a branch tool; saving replaces the whole list."
      open={ext.open}
      onOpenChange={(next) => {
        if (save.isPending) return;
        ext.setOpen(next);
      }}
    >
      <div className="tai-stack">
        <ExtensionComboBuilder
          available={available}
          value={ext.draft}
          onChange={(next) => {
            ext.setConfirmingClear(false);
            ext.setDraft(next);
          }}
          disabled={save.isPending}
          idPrefix="tool-extensions-combo-builder"
          availableReady={availableReady}
        />

        {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}

        {ext.confirmingClear ? (
          <p role="alert" className="tai-status-err" style={{ margin: 0 }}>
            Saving an empty list clears every extension set and drops all of {tool}&apos;s branch
            tools. Confirm to proceed.
          </p>
        ) : null}

        <div className="tai-row">
          <Button type="button" variant="primary" disabled={save.isPending} onClick={ext.onSave}>
            {save.isPending ? <Spinner label="Saving extensions" /> : null}
            {ext.confirmingClear ? 'Confirm clear' : 'Save'}
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              ext.setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ToolExtensionsCard({ tool }: { readonly tool: string }): ReactNode {
  const ext = useToolExtensions(tool);
  const { extensionsQuery, presetsQuery, save } = ext;

  // The extensions read is this card's own data: a rejected load surfaces LOUDLY before
  // the pending skeleton, so an error is never masked while presets is still in flight.
  if (extensionsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(extensionsQuery.error)}
        onRetry={() => void extensionsQuery.refetch()}
      />
    );
  }
  if (extensionsQuery.isPending || presetsQuery.isPending) {
    return (
      <div className="tai-stack">
        <Skeleton height={20} width="40%" />
        <Skeleton height={48} />
      </div>
    );
  }

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
          Extension sets
        </h3>
        {!ext.isPresetTool ? (
          <Button
            type="button"
            onClick={() => {
              ext.openEditor(combos);
            }}
          >
            Edit extension sets
          </Button>
        ) : null}
      </div>

      {/* The presets read is not load-bearing, so its failure does not wall the card —
          but with no preset info a PRESET tool looks like a manifest tool, so state the
          failure and offer the retry that restores the distinction. */}
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
          <FleetReport summary={summarizeFleetFanout(save.data.fanout)} />
        </>
      ) : null}

      <CombosView tool={tool} isPresetTool={ext.isPresetTool} combos={combos} />

      <EditExtensionsDialog
        tool={tool}
        ext={ext}
        available={available}
        availableReady={extensionsQuery.isSuccess}
      />
    </section>
  );
}

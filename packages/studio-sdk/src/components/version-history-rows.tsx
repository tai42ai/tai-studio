/**
 * The row and dialog pieces of `VersionHistoryPanel`: one version's table row and
 * action cluster (`VersionRow`), the selected version's body (`SelectedVersionBody`),
 * the two-version compare dialog (`CompareDialog`), and the rollback confirm
 * dialog (`RollbackConfirmDialog`). All generic and kind-agnostic.
 */
import type { ReactNode } from 'react';

import { Dialog } from './dialog';
import { CheckCircleIcon, PendingIcon } from './icons';
import { JsonDiff } from './json-diff';
import { JsonTree } from './json-tree';
import { Button, Card, ErrorState, Spinner } from './primitives';
import { ScrollRegion } from './scroll-region';
import { TD, TR } from './table';
import { TagChips } from './tags';
import type { VersionHistoryEntry } from './version-history-panel';

interface VersionRowProps {
  readonly entry: VersionHistoryEntry;
  readonly showTags: boolean;
  readonly canCompare: boolean;
  /** This row is the armed Compare source. */
  readonly compareArmed: boolean;
  readonly readOnly: boolean;
  /** An edit-tags affordance is available (the consumer supplied `onEditTags`). */
  readonly canEditTags: boolean;
  readonly onView: (version: number) => void;
  readonly onCompare: (version: number) => void;
  readonly onEditTags: (version: number) => void;
  readonly onRollback: (version: number) => void;
}

/** One version's row: its number, timestamp, status mark, optional tags, and the
 *  View / Compare / Edit tags / Roll back action cluster. */
export function VersionRow({
  entry,
  showTags,
  canCompare,
  compareArmed,
  readOnly,
  canEditTags,
  onView,
  onCompare,
  onEditTags,
  onRollback,
}: VersionRowProps): ReactNode {
  return (
    <TR data-testid={`version-row-${String(entry.version)}`}>
      <TD className="tai-table-id" numeric>
        {entry.version}
      </TD>
      <TD className="tai-mono">{entry.created_at}</TD>
      <TD>
        {entry.is_current ? (
          <span className="tai-status tai-status-ok">
            <CheckCircleIcon />
            Current
          </span>
        ) : (
          <span className="tai-status tai-status-pending">
            <PendingIcon />
            Historical
          </span>
        )}
      </TD>
      {showTags ? (
        <TD>
          {(entry.tags ?? []).length > 0 ? (
            <TagChips tags={entry.tags ?? []} />
          ) : (
            <span className="tai-muted">—</span>
          )}
        </TD>
      ) : null}
      <TD>
        <div className="tai-row">
          <Button
            aria-label={`View version ${String(entry.version)}`}
            onClick={() => {
              onView(entry.version);
            }}
          >
            View
          </Button>
          {canCompare ? (
            <Button
              // The name starts with the word the button is SHOWING, which is what
              // WCAG 2.5.3 (Label in Name) asks: a constant "Compare …" would leave a
              // button reading "Comparing…" named "Compare", and a voice-control user
              // naming a control they cannot see. The button stays ENABLED while armed
              // — unlike an Edit action, a second click on the armed row is the disarm,
              // so there is nothing to take away.
              aria-label={`${compareArmed ? 'Comparing' : 'Compare'} version ${String(entry.version)}`}
              onClick={() => {
                onCompare(entry.version);
              }}
            >
              {compareArmed ? 'Comparing…' : 'Compare'}
            </Button>
          ) : null}
          {canEditTags && !readOnly ? (
            <Button
              aria-label={`Edit tags for version ${String(entry.version)}`}
              onClick={() => {
                onEditTags(entry.version);
              }}
            >
              Edit tags
            </Button>
          ) : null}
          {readOnly ? null : (
            <Button
              variant="secondary"
              aria-label={`Roll back to version ${String(entry.version)}`}
              disabled={entry.is_current}
              onClick={() => {
                onRollback(entry.version);
              }}
            >
              Roll back
            </Button>
          )}
        </div>
      </TD>
    </TR>
  );
}

/** The selected version's opaque body, rendered through `JsonTree`. */
export function SelectedVersionBody({ entry }: { readonly entry: VersionHistoryEntry }): ReactNode {
  return (
    <section className="tai-stack tai-stack-2">
      <h3 className="tai-section-title">Version {entry.version} body</h3>
      <Card>
        <JsonTree data={entry.body} label={`Version ${String(entry.version)} body`} />
      </Card>
    </section>
  );
}

/** A structural diff of two version bodies, in a dialog. */
export function CompareDialog({
  from,
  to,
  fromBody,
  toBody,
  onClose,
}: {
  readonly from: number;
  readonly to: number;
  readonly fromBody: unknown;
  readonly toBody: unknown;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Dialog
      title={`v${String(from)} compared with v${String(to)}`}
      description="A structural diff of the two version bodies. Arrays compare whole."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* A deep diff row can run wider than the dialog; it scrolls in place. */}
      <ScrollRegion label="Version diff">
        <JsonDiff before={fromBody} after={toBody} />
      </ScrollRegion>
      <div className="tai-dialog-actions">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

/** The rollback confirmation, surfacing any rollback failure verbatim. */
export function RollbackConfirmDialog({
  version,
  rollbackPending,
  rollbackError,
  extraDescription,
  onCancel,
  onConfirm,
}: {
  readonly version: number;
  readonly rollbackPending: boolean | undefined;
  readonly rollbackError: string | undefined;
  readonly extraDescription: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (version: number) => void;
}): ReactNode {
  return (
    <Dialog
      title="Roll back version"
      description={
        `Make version ${String(version)} the active version? The version history is preserved.` +
        (extraDescription !== undefined ? ` ${extraDescription}` : '')
      }
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      {rollbackError !== undefined ? <ErrorState message={rollbackError} /> : null}
      <div className="tai-dialog-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={rollbackPending}
          onClick={() => {
            onConfirm(version);
          }}
        >
          {rollbackPending ? <Spinner label="Rolling back" /> : null}
          Roll back
        </Button>
      </div>
    </Dialog>
  );
}

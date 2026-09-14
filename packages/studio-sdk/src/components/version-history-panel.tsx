/**
 * `VersionHistoryPanel` — a GENERIC, kind-agnostic viewer for a versioned
 * document's history. It knows nothing about presets, AC policies, or authored
 * agents: it takes a plain versions list (`{version, body, is_current,
 * created_at}`, optionally `tags`) plus a `onRollback` callback, renders the list
 * (a "Current" status mark driven by `is_current`), a `JsonTree` view of the selected
 * version's opaque body, a per-row Rollback action behind a confirm dialog, and a
 * per-row Compare action that opens a structural `JsonDiff` of two versions' bodies.
 * Each consumer (e.g. presets, AC policies) wires it to its own routes.
 *
 * Two optional affordances, inert unless supplied:
 *  - a Tags column appears when any entry carries `tags` OR `onEditTags` is given
 *    (so tag-less consumers see no empty column);
 *  - when `onEditTags` is provided, a per-row "Edit tags" action opens a small
 *    dialog seeded from the row's tags; SAVE calls the callback with the NEW list
 *    and the panel awaits it with INTERNAL pending/error state, rendering a
 *    rejection's message verbatim.
 *
 * SAFETY: `body` and tags are arbitrary server JSON, rendered through `JsonTree` /
 * `Badge` (React escapes every value) — never an HTML sink.
 *
 * Geometry and ink come from the design-system classes. Two rules shape the table:
 * a row's state is a MARK plus a label (`tai-status` + `CheckCircleIcon` /
 * `PendingIcon`), never color alone, and the version number and timestamp are the
 * machine voice (`tai-table-id` / `tai-mono`). The table itself sits in a
 * `ScrollRegion` so a narrow viewport scrolls it instead of the page.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { errorMessage } from '../errors';
import { Dialog } from './dialog';
import { Field } from './field';
import { Button, Card, ErrorState, Spinner } from './primitives';
import { ScrollRegion } from './scroll-region';
import { Table, TBody, TH, THead, TR } from './table';
import { TagsInput } from './tags';
import {
  CompareDialog,
  RollbackConfirmDialog,
  SelectedVersionBody,
  VersionRow,
} from './version-history-rows';

/** One version row — the kind-agnostic shape every consumer projects into. */
export interface VersionHistoryEntry {
  readonly version: number;
  readonly body: unknown;
  readonly is_current: boolean;
  readonly created_at: string;
  /** The version's generic label list, surfaced as a Tags column when present. */
  readonly tags?: readonly string[];
}

export interface VersionHistoryPanelProps {
  readonly versions: readonly VersionHistoryEntry[];
  /** Roll the active pointer to `version`. The consumer owns the mutation. */
  readonly onRollback: (version: number) => void;
  /** Fired when a version is selected for viewing (optional). */
  readonly onView?: (version: number) => void;
  /** The consumer's rollback mutation is in flight. */
  readonly rollbackPending?: boolean;
  /** A loud rollback failure message to surface in the confirm dialog. */
  readonly rollbackError?: string;
  /**
   * A read-only history view: the version list and each version's body stay
   * visible (history is a read surface), but EVERY mutating action is hidden —
   * the per-row Rollback and, where `onEditTags` is supplied, Edit tags.
   * Defaults to interactive.
   */
  readonly readOnly?: boolean;
  /**
   * Extra consequence copy appended to the rollback confirm dialog's description
   * (announced to assistive tech via the dialog's `aria-describedby`). Consumers
   * whose rollback has an immediate live effect (e.g. re-pointing access-control
   * enforcement) pass a sentence stating so; omitted when there is nothing extra.
   */
  readonly rollbackConfirmDescription?: string;
  /**
   * Replace one version's tag annotation. When provided, a per-row "Edit tags"
   * action opens a dialog seeded from the row's tags and SAVE calls this with the
   * NEW list; the panel awaits the returned promise with internal pending/error
   * state. Omitted ⇒ no edit affordance (tags stay read-only).
   */
  readonly onEditTags?: (version: number, tags: string[]) => Promise<void>;
}

/** The initially-selected version: the current one, else the first listed. */
function initialSelection(versions: readonly VersionHistoryEntry[]): number | null {
  const current = versions.find((entry) => entry.is_current);
  return current?.version ?? versions[0]?.version ?? null;
}

/**
 * The per-version tag editor dialog. Seeds a draft from the row's tags and calls
 * `onSave` on submit, awaiting it with LOCAL pending/error state: a rejection's
 * message renders verbatim and the dialog stays open; success closes it.
 */
function EditTagsDialog({
  version,
  initialTags,
  onSave,
  onClose,
}: {
  readonly version: number;
  readonly initialTags: readonly string[];
  readonly onSave: (version: number, tags: string[]) => Promise<void>;
  readonly onClose: () => void;
}): ReactNode {
  const [tags, setTags] = useState<string[]>([...initialTags]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = (): void => {
    setPending(true);
    setError(undefined);
    onSave(version, tags).then(
      () => {
        onClose();
      },
      (reason: unknown) => {
        setError(errorMessage(reason));
        setPending(false);
      },
    );
  };

  return (
    <Dialog
      title={`Edit tags — version ${String(version)}`}
      description="Version tags are labels on an immutable body; editing them rebinds nothing."
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <div className="tai-stack">
        {/* The editor is named by its Field, like every other site: its draft input
            claims the Field's control id, so the visible label IS the name. */}
        <Field label="Tags" description="Labels on this version's immutable body.">
          <TagsInput value={tags} onChange={setTags} disabled={pending} />
        </Field>
        {error !== undefined ? <ErrorState message={error} /> : null}
      </div>
      <div className="tai-dialog-actions">
        <Button
          onClick={() => {
            onClose();
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? <Spinner label="Saving tags" /> : null}
          Save tags
        </Button>
      </div>
    </Dialog>
  );
}

export function VersionHistoryPanel({
  versions,
  onRollback,
  onView,
  rollbackPending,
  rollbackError,
  readOnly = false,
  rollbackConfirmDescription,
  onEditTags,
}: VersionHistoryPanelProps): ReactNode {
  const [selected, setSelected] = useState<number | null>(() => initialSelection(versions));
  const [confirming, setConfirming] = useState<number | null>(null);
  // The armed Compare source (first click), and the open compare pair (second click).
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [comparePair, setComparePair] = useState<{ from: number; to: number } | null>(null);
  const [editingTags, setEditingTags] = useState<number | null>(null);

  // Close the confirm dialog on a SUCCESSFUL rollback: the consumer's mutation
  // drives `rollbackPending` true→false, and success is that transition WITHOUT a
  // `rollbackError`. We compare the prior `rollbackPending` to the current one via a
  // ref so this fires exactly once on the true→false edge — never on mount (the ref
  // seeds from the initial value, so no edge exists) and never on a failure (a set
  // `rollbackError` keeps the dialog open showing the error).
  const wasRollbackPending = useRef<boolean | undefined>(rollbackPending);
  useEffect(() => {
    const settledFromPending = wasRollbackPending.current === true && rollbackPending !== true;
    wasRollbackPending.current = rollbackPending;
    if (settledFromPending && rollbackError === undefined) {
      setConfirming(null);
    }
  }, [rollbackPending, rollbackError]);

  const selectedEntry = versions.find((entry) => entry.version === selected);
  const showTags =
    onEditTags !== undefined || versions.some((entry) => (entry.tags ?? []).length > 0);
  const canCompare = versions.length >= 2;

  const view = (version: number): void => {
    setSelected(version);
    onView?.(version);
  };

  const compare = (version: number): void => {
    if (compareFrom === null) {
      setCompareFrom(version);
    } else if (compareFrom === version) {
      setCompareFrom(null);
    } else {
      setComparePair({ from: compareFrom, to: version });
    }
  };

  const closeCompare = (): void => {
    setComparePair(null);
    setCompareFrom(null);
  };

  const editingEntry = versions.find((entry) => entry.version === editingTags);
  const fromBody = versions.find((entry) => entry.version === comparePair?.from)?.body;
  const toBody = versions.find((entry) => entry.version === comparePair?.to)?.body;

  return (
    <div className="tai-stack">
      <Card>
        {/* The action column makes this table wider than a phone viewport; it scrolls
            inside its own region rather than pushing the page sideways. */}
        <ScrollRegion label="Version history">
          <Table>
            <THead>
              <TR>
                <TH numeric>Version</TH>
                <TH>Created</TH>
                <TH>Status</TH>
                {showTags ? <TH>Tags</TH> : null}
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {versions.map((entry) => (
                <VersionRow
                  key={entry.version}
                  entry={entry}
                  showTags={showTags}
                  canCompare={canCompare}
                  compareArmed={compareFrom === entry.version}
                  readOnly={readOnly}
                  canEditTags={onEditTags !== undefined}
                  onView={view}
                  onCompare={compare}
                  onEditTags={setEditingTags}
                  onRollback={setConfirming}
                />
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      </Card>

      {compareFrom !== null && comparePair === null ? (
        <p role="status" className="tai-muted">
          Comparing from version {compareFrom} — pick another version, or Compare again to cancel.
        </p>
      ) : null}

      {selectedEntry !== undefined ? <SelectedVersionBody entry={selectedEntry} /> : null}

      {comparePair !== null ? (
        <CompareDialog
          from={comparePair.from}
          to={comparePair.to}
          fromBody={fromBody}
          toBody={toBody}
          onClose={closeCompare}
        />
      ) : null}

      {editingEntry !== undefined && onEditTags !== undefined ? (
        <EditTagsDialog
          version={editingEntry.version}
          initialTags={editingEntry.tags ?? []}
          onSave={onEditTags}
          onClose={() => {
            setEditingTags(null);
          }}
        />
      ) : null}

      {confirming !== null ? (
        <RollbackConfirmDialog
          version={confirming}
          rollbackPending={rollbackPending}
          rollbackError={rollbackError}
          extraDescription={rollbackConfirmDescription}
          onCancel={() => {
            setConfirming(null);
          }}
          onConfirm={onRollback}
        />
      ) : null}
    </div>
  );
}

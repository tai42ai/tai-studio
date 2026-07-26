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
 * `tai-scroll-region` so a narrow viewport scrolls it instead of the page.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { errorMessage } from '../errors';
import { Dialog } from './dialog';
import { CheckCircleIcon, PendingIcon } from './icons';
import { JsonDiff } from './json-diff';
import { JsonTree } from './json-tree';
import { Button, Card, ErrorState, Spinner } from './primitives';
import { Table, TBody, TD, TH, THead, TR } from './table';
import { TagChips, TagsInput } from './tags';

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
   * visible (history is a read surface), but the per-row Rollback action — the
   * only mutation — is hidden. Defaults to interactive (Rollback shown).
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
        <TagsInput value={tags} onChange={setTags} disabled={pending} />
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
        <div className="tai-scroll-region">
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
                <TR key={entry.version} data-testid={`version-row-${String(entry.version)}`}>
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
                          view(entry.version);
                        }}
                      >
                        View
                      </Button>
                      {canCompare ? (
                        <Button
                          aria-label={`Compare version ${String(entry.version)}`}
                          onClick={() => {
                            compare(entry.version);
                          }}
                        >
                          {compareFrom === entry.version ? 'Comparing…' : 'Compare'}
                        </Button>
                      ) : null}
                      {onEditTags !== undefined ? (
                        <Button
                          aria-label={`Edit tags for version ${String(entry.version)}`}
                          onClick={() => {
                            setEditingTags(entry.version);
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
                            setConfirming(entry.version);
                          }}
                        >
                          Roll back
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>

      {compareFrom !== null && comparePair === null ? (
        <p role="status" className="tai-muted">
          Comparing from version {compareFrom} — pick another version, or Compare again to cancel.
        </p>
      ) : null}

      {selectedEntry !== undefined ? (
        <section className="tai-stack tai-stack-2">
          <h3 className="tai-section-title">Version {selectedEntry.version} body</h3>
          <Card>
            <JsonTree data={selectedEntry.body} />
          </Card>
        </section>
      ) : null}

      {comparePair !== null ? (
        <Dialog
          title={`v${String(comparePair.from)} → v${String(comparePair.to)}`}
          description="A structural diff of the two version bodies. Arrays compare whole."
          open
          onOpenChange={(next) => {
            if (!next) closeCompare();
          }}
        >
          {/* A deep diff row can run wider than the dialog; it scrolls in place. */}
          <div className="tai-scroll-region">
            <JsonDiff before={fromBody} after={toBody} />
          </div>
          <div className="tai-dialog-actions">
            <Button onClick={closeCompare}>Close</Button>
          </div>
        </Dialog>
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
        <Dialog
          title="Roll back version"
          description={
            `Make version ${String(confirming)} the active version? The version history is preserved.` +
            (rollbackConfirmDescription !== undefined ? ` ${rollbackConfirmDescription}` : '')
          }
          open
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
        >
          {rollbackError !== undefined ? <ErrorState message={rollbackError} /> : null}
          <div className="tai-dialog-actions">
            <Button
              onClick={() => {
                setConfirming(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={rollbackPending}
              onClick={() => {
                onRollback(confirming);
              }}
            >
              {rollbackPending ? <Spinner label="Rolling back" /> : null}
              Roll back
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

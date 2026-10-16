/**
 * The "Check records against the schema" card, under the subjects table. It walks every stored
 * record of a chosen kind against the state's current effective schema and lists the misfits.
 *
 * The walk is LIVE — an `AbortController`-guarded loop over `checkStateRecords(name, {kind, limit,
 * cursor})` that follows `next_cursor` to the end, aggregating each page's `checked`/`items`/
 * `held` — never a react-query cache, so it re-reads the records on every click. A mid-walk page
 * error stops the walk LOUDLY (an `ErrorState` whose Retry resumes from the last good cursor, so a
 * failure is never a silent short count); a 501 reads as a muted "not enabled" note.
 */
import type { HeldPendingSave, RecordCheckItem, StateSubject } from '@tai42/api-client';
import {
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  featureDisabledMessage,
  Field,
  isFeatureDisabled,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { HeldSubjectsLine } from './HeldSubjectsLine';
import { formatWhen, isoWhen } from './recordTime';

/** One walk of a kind's records against the effective schema: the live aggregate so far. */
type CheckStatus = 'idle' | 'running' | 'done' | 'error' | 'disabled';

/**
 * Walk the pages of `checkStateRecords(stateName, {kind, …})` to the end, aggregating the live
 * counts and misfits. `run(false)` starts a fresh walk; `run(true)` resumes from the last good
 * cursor (used by a Retry after a mid-walk page error). Any walk in flight is aborted on a new
 * run, a kind change, or unmount, so a resolved page never writes to a stale aggregate.
 */
function useRecordCheckWalk(stateName: string, kind: string) {
  const api = useApi();
  const [status, setStatus] = useState<CheckStatus>('idle');
  const [checked, setChecked] = useState(0);
  const [misfits, setMisfits] = useState<RecordCheckItem[]>([]);
  const [held, setHeld] = useState<HeldPendingSave[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [disabledMessage, setDisabledMessage] = useState<string | null>(null);
  // The cursor the next page reads from; advanced only after a page lands, so a resume after a
  // failed page re-requests exactly that page rather than skipping it.
  const cursorRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const reset = (): void => {
    abortRef.current?.abort();
    setStatus('idle');
    setChecked(0);
    setMisfits([]);
    setHeld([]);
    setError(null);
    setDisabledMessage(null);
    cursorRef.current = undefined;
  };

  // A walk in flight is abandoned when the card unmounts, so a resolved page never writes to a
  // gone component.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = (resume: boolean): void => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!resume) {
      setChecked(0);
      setMisfits([]);
      setHeld([]);
      cursorRef.current = undefined;
    }
    setError(null);
    setDisabledMessage(null);
    setStatus('running');
    void (async () => {
      try {
        for (;;) {
          const page = await api.checkStateRecords(
            stateName,
            { kind, limit: 500, cursor: cursorRef.current },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setChecked((n) => n + page.checked);
          if (page.items.length > 0) setMisfits((prev) => [...prev, ...page.items]);
          if (page.held.length > 0) setHeld((prev) => [...prev, ...page.held]);
          cursorRef.current = page.next_cursor ?? undefined;
          if (page.next_cursor == null) break;
        }
        setStatus('done');
      } catch (err) {
        // An abort is the card's own doing (unmount or a restart), never a failure to surface.
        if (controller.signal.aborted) return;
        if (isFeatureDisabled(err)) {
          setDisabledMessage(featureDisabledMessage(err));
          setStatus('disabled');
          return;
        }
        // A mid-walk page failed: stop loudly with the partial aggregate still shown and a Retry
        // that resumes from the last good cursor — never a silent truncation.
        setError(errorMessage(err));
        setStatus('error');
      }
    })();
  };

  return { status, checked, misfits, held, error, disabledMessage, run, reset };
}

/** The misfits table: one row per record that does not fit, each reason rendered `path — message`. */
function CheckMisfitsTable({
  misfits,
  onOpen,
}: {
  readonly misfits: readonly RecordCheckItem[];
  readonly onOpen: (subject: StateSubject) => void;
}): ReactNode {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Subject</TH>
          <TH>Target</TH>
          <TH>Updated</TH>
          <TH>Reasons</TH>
        </TR>
      </THead>
      <TBody>
        {misfits.map((item) => (
          <TR
            key={`${item.subject.target_kind}:${item.subject.target_name}:${item.subject.kind}:${item.subject.key}`}
          >
            <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>
              <button
                type="button"
                className="tai-link"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  onOpen(item.subject);
                }}
              >
                {item.subject.key}
              </button>
            </TD>
            <TD>
              {item.subject.target_kind} {item.subject.target_name}
            </TD>
            <TD style={{ whiteSpace: 'nowrap' }} title={isoWhen(item.updated_at)}>
              {formatWhen(item.updated_at)}
            </TD>
            <TD>
              <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
                {item.reasons.map((reason) => (
                  <li key={`${reason.path}|${reason.message}`}>
                    <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{reason.path}</span> —{' '}
                    {reason.message}
                  </li>
                ))}
              </ul>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function CheckRecordsCard({
  stateName,
  kinds,
  onOpen,
}: {
  readonly stateName: string;
  readonly kinds: readonly string[];
  readonly onOpen: (subject: StateSubject) => void;
}): ReactNode {
  const [kind, setKind] = useState(kinds[0] ?? '');
  const { status, checked, misfits, held, error, disabledMessage, run, reset } = useRecordCheckWalk(
    stateName,
    kind,
  );
  const started = status !== 'idle' && status !== 'disabled';

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-2)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>
            Check records against the schema
          </h3>
          <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'flex-end' }}>
            <Field label="Kind">
              <Select
                value={kind}
                aria-label="Check kind"
                onValueChange={(next) => {
                  setKind(next);
                  reset();
                }}
                options={kinds.map((k) => ({ value: k, label: k }))}
              />
            </Field>
            <Button
              type="button"
              variant="primary"
              disabled={kind === '' || status === 'running'}
              onClick={() => {
                run(false);
              }}
            >
              {status === 'running' ? <Spinner label="Checking" /> : null}
              Check records
            </Button>
          </div>
        </div>
        {status === 'disabled' ? (
          <p
            style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}
            data-testid="check-disabled"
          >
            Checking records is not enabled on this deployment
            {disabledMessage !== null && disabledMessage !== '' ? `: ${disabledMessage}` : '.'}
          </p>
        ) : (
          <>
            {started ? (
              <p style={{ margin: 0 }} data-testid="check-summary">
                {checked} checked — {misfits.length} do not fit
              </p>
            ) : null}
            {held.length > 0 ? <HeldSubjectsLine held={held} /> : null}
            {misfits.length > 0 ? <CheckMisfitsTable misfits={misfits} onOpen={onOpen} /> : null}
            {status === 'done' && misfits.length === 0 ? (
              <EmptyState
                title="All records fit"
                description="Every checked record fits the schema."
              />
            ) : null}
            {status === 'error' ? (
              <ErrorState
                message={error ?? 'The check failed.'}
                onRetry={() => {
                  run(true);
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * The thread list's bulk reset: forget every SELECTED thread in one gesture.
 *
 * It fans the existing per-thread delete (`deleteConversationThread`) out over the
 * ticked thread ids — one door, called once per thread, sequentially — so each
 * thread goes through the same in-flight/FIFO guard the single delete does. There
 * is no new server door: "reset all matching a filter across every page" would be
 * a distinct unbounded capability and is deliberately NOT this.
 *
 * Every failure is surfaced LOUDLY and never swallowed: a thread whose delete
 * rejects (a `409` with a turn in flight, or any other error) stays in the
 * selection and shows as a failed row with its reason and a Retry, so a partial
 * failure is visible and recoverable thread by thread. The threads that reset
 * cleanly drop from the selection and their cached reads are invalidated, so the
 * gone rows leave the list.
 *
 * Guarded by the house `ConfirmDialog`, whose copy and confirm label both name the
 * count. Mounted whenever the reader may delete on this route; it renders nothing
 * until there is a selection to act on or a result to report.
 */
import { Button, ConfirmDialog, errorMessage, useApi } from '@tai42/studio-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/** A thread whose reset did not go through, kept with the reason to show and retry. */
interface ResetFailure {
  readonly threadId: string;
  readonly error: unknown;
}

function plural(count: number): string {
  return count === 1 ? '' : 's';
}

export function BulkThreadReset({
  route,
  selectedIds,
  onReset,
}: {
  readonly route: string;
  /** The ticked, currently-loaded thread ids the reset fans out over. */
  readonly selectedIds: readonly string[];
  /** Drop the threads that reset cleanly from the selection — they are gone. */
  readonly onReset: (succeeded: readonly string[]) => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ succeeded: number; failed: number } | null>(null);
  const [failures, setFailures] = useState<readonly ResetFailure[]>([]);

  // The route's thread listing and the admin failed-delivery audit both lose a row
  // when any thread is forgotten; refreshed once per batch.
  const invalidateRouteListings = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['conversations', 'threads', route] });
    void queryClient.invalidateQueries({ queryKey: ['conversations', 'failed-messages'] });
  };

  // A forgotten thread's transcript no longer exists; drop its cached reads so no
  // stale transcript outlives it.
  const invalidateTranscript = (threadId: string): void => {
    void queryClient.invalidateQueries({
      queryKey: ['conversations', 'transcript', route, threadId],
    });
  };

  const open = (): void => {
    // A fresh run starts with a clean slate — no result from an earlier batch lingers.
    setSummary(null);
    setFailures([]);
    setConfirming(true);
  };

  const confirm = (): void => {
    const ids = selectedIds;
    void (async () => {
      setRunning(true);
      const succeeded: string[] = [];
      const failed: ResetFailure[] = [];
      for (const threadId of ids) {
        try {
          await api.deleteConversationThread(route, threadId);
          succeeded.push(threadId);
        } catch (error) {
          failed.push({ threadId, error });
        }
      }
      if (succeeded.length > 0) {
        invalidateRouteListings();
        for (const threadId of succeeded) invalidateTranscript(threadId);
      }
      setRunning(false);
      setConfirming(false);
      setFailures(failed);
      setSummary({ succeeded: succeeded.length, failed: failed.length });
      onReset(succeeded);
    })();
  };

  const retry = (threadId: string): void => {
    void (async () => {
      setRunning(true);
      try {
        await api.deleteConversationThread(route, threadId);
        invalidateRouteListings();
        invalidateTranscript(threadId);
        setFailures((current) => current.filter((failure) => failure.threadId !== threadId));
        setSummary((current) =>
          current === null
            ? current
            : { succeeded: current.succeeded + 1, failed: current.failed - 1 },
        );
        onReset([threadId]);
      } catch (error) {
        setFailures((current) =>
          current.map((failure) => (failure.threadId === threadId ? { threadId, error } : failure)),
        );
      } finally {
        setRunning(false);
      }
    })();
  };

  if (selectedIds.length === 0 && summary === null) return null;

  return (
    <div className="tai-stack tai-stack-3" data-testid="conversation-bulk-reset">
      {selectedIds.length > 0 ? (
        <Button variant="danger" onClick={open} disabled={running}>
          Reset selected ({selectedIds.length})
        </Button>
      ) : null}

      {summary !== null ? (
        <div
          role={failures.length > 0 ? 'alert' : 'status'}
          className="tai-stack tai-stack-3"
          data-testid="conversation-bulk-reset-result"
        >
          <p style={{ margin: 0 }}>
            {summary.succeeded > 0
              ? `${String(summary.succeeded)} thread${plural(summary.succeeded)} reset.`
              : null}
            {summary.failed > 0
              ? ` ${String(summary.failed)} thread${plural(summary.failed)} could not be reset:`
              : null}
          </p>
          {failures.map((failure) => (
            <div key={failure.threadId} className="tai-row">
              <span style={{ color: 'var(--tai-color-err-text)' }}>
                Thread {failure.threadId}: {errorMessage(failure.error)}
              </span>
              <Button
                onClick={() => {
                  retry(failure.threadId);
                }}
                disabled={running}
              >
                Retry
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Reset selected threads"
          confirmLabel={`Reset ${String(selectedIds.length)} thread${plural(selectedIds.length)}`}
          pendingLabel="Resetting"
          isPending={running}
          onConfirm={confirm}
          onClose={() => {
            setConfirming(false);
          }}
        >
          <p style={{ margin: 0 }}>
            Reset {selectedIds.length} selected thread{plural(selectedIds.length)}? This forgets
            each thread&rsquo;s transcript and the agent&rsquo;s memory of the conversation, so a
            later message on the same address starts fresh. It cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * The destructive per-thread actions on the transcript surface.
 *
 * - DELETE THREAD (every thread): forget this one thread — its transcript records
 *   and the agent's checkpoint memory of it — so a later message on the same address
 *   starts fresh. Uses the route the thread is open under; the `thread_id` rides the
 *   query value the client encodes once.
 * - ERASE PERSON (only a LINKED person's aggregated thread): the GDPR right-to-erasure
 *   action, with a WIDE blast radius — it erases the person ENTIRELY, forgetting their
 *   aggregated thread and checkpoint, their person row, and every address→person link,
 *   across EVERY route they ever wrote under. It surfaces only when the open thread is
 *   a person-aggregated one (its id carries the reserved person namespace), because
 *   that id is the only place a person appears in this monitor.
 *
 * Both are guarded by the house `ConfirmDialog` with plainly truthful copy, and both
 * leave the (now-forgotten) thread on success — the transcript it named no longer
 * exists — by navigating back to the route's thread list.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ConfirmDialog,
  errorMessage,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import { personIdOfThread } from './persons';

export function ThreadActions({
  route,
  threadId,
}: {
  readonly route: string;
  readonly threadId: string;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();

  const personId = personIdOfThread(threadId);

  const [confirming, setConfirming] = useState<'thread' | 'person' | null>(null);

  // On success the thread this pane reads is gone: leave it for the route's list,
  // then let the invalidations refill that list without this thread.
  const leaveToList = (): void => {
    navigate('conversations', { route });
  };

  const deleteThread = useMutation({
    mutationFn: () => api.deleteConversationThread(route, threadId),
    onSuccess: () => {
      setConfirming(null);
      leaveToList();
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'threads', route] });
      void queryClient.invalidateQueries({
        queryKey: ['conversations', 'transcript', route, threadId],
      });
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'failed-messages'] });
    },
  });

  const erasePerson = useMutation({
    // Only reachable when `personId` is non-null (the button renders only then).
    mutationFn: () => api.deleteConversationPerson(personId ?? ''),
    onSuccess: () => {
      setConfirming(null);
      leaveToList();
      // A person spans routes: every thread listing and transcript may have changed,
      // so invalidate the whole thread/transcript space, not just this route's.
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'threads'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'transcript'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'failed-messages'] });
    },
  });

  const open = (which: 'thread' | 'person'): void => {
    // Clear any prior failure so the confirm opens clean, never carrying a stale
    // error from an earlier attempt (on this thread or another).
    deleteThread.reset();
    erasePerson.reset();
    setConfirming(which);
  };

  return (
    <Card data-testid="conversation-thread-actions">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--tai-space-3)',
        }}
      >
        <Button
          variant="danger"
          aria-label={`Delete thread ${threadId}`}
          onClick={() => {
            open('thread');
          }}
        >
          Delete thread
        </Button>
        {personId !== null ? (
          <Button
            variant="danger"
            aria-label={`Erase person ${personId}`}
            onClick={() => {
              open('person');
            }}
          >
            Erase person (GDPR)
          </Button>
        ) : null}
      </div>

      {confirming === 'thread' ? (
        <ConfirmDialog
          title="Delete thread"
          confirmLabel="Delete thread"
          pendingLabel="Deleting"
          isPending={deleteThread.isPending}
          error={deleteThread.isError ? errorMessage(deleteThread.error) : null}
          onConfirm={() => {
            deleteThread.mutate();
          }}
          onClose={() => {
            setConfirming(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Delete this thread? This forgets its transcript and the agent&rsquo;s memory of the
            conversation, so a later message on the same address starts fresh. It cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}

      {confirming === 'person' && personId !== null ? (
        <ConfirmDialog
          title="Erase person"
          confirmLabel="Erase person"
          pendingLabel="Erasing"
          isPending={erasePerson.isPending}
          error={erasePerson.isError ? errorMessage(erasePerson.error) : null}
          onConfirm={() => {
            erasePerson.mutate();
          }}
          onClose={() => {
            setConfirming(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Erase this person entirely? This is a GDPR right-to-erasure action. It forgets the
            person&rsquo;s aggregated conversation and the agent&rsquo;s memory of it, deletes their
            person record, and removes every channel address linked to them &mdash; across{' '}
            <strong>every route</strong> they have ever written under. It cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

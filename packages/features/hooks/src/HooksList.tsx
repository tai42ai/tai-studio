/**
 * The registered-hooks list. Reads `api.listHooks` through TanStack Query,
 * keyed on the active `topic` filter so the query refetches whenever the filter
 * changes (empty = list all). A hook's row shows its name / topic / tool plus a
 * `condition` and/or `expr` badge when either gate is set. Each row deletes
 * behind a confirm `<Dialog>` that calls `api.unregisterHook`; a successful
 * removal invalidates the whole list.
 *
 * Server state is surfaced loudly: loading → `Skeleton`, empty →
 * `EmptyState`, and any failed request → an always-visible `ErrorState` — never
 * a silent empty render.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { HookParams } from '@tai42/api-client';

import { HOOKS_KEY_ROOT, hooksListKey } from './keys';

function hasCondition(hook: HookParams): boolean {
  return hook.condition !== null || hook.condition_id !== null;
}

function hasExpr(hook: HookParams): boolean {
  return hook.expr !== null || hook.expr_id !== null;
}

/** A topic's bound verifier plus its config (a `secret_env` name, never a secret). */
interface TopicVerifier {
  readonly verifier: string;
  readonly config: Record<string, unknown>;
}

/**
 * Display of the per-topic verifier bindings the `/api/hooks` response carries,
 * with a per-topic UNBIND control. Each row shows the topic and the verifier bound
 * to it; the config's KEYS are listed (they never hold secret values, only a
 * `secret_env` name), never its values. Renders nothing when no topic has a bound
 * verifier.
 *
 * Unbind runs behind a confirm `Dialog` (the consequence is stated plainly: an
 * unbound topic's ingress is OPEN/unauthenticated) that calls
 * `api.deleteTopicVerifier`; success invalidates the whole hooks list so the
 * binding disappears. A 404 (already unbound elsewhere) surfaces loudly in the
 * dialog — never swallowed.
 */
function TopicVerifiers({ verifiers }: { verifiers: Record<string, TopicVerifier> }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [pendingUnbind, setPendingUnbind] = useState<string | null>(null);

  const unbindMutation = useMutation({
    mutationFn: (topic: string) => api.deleteTopicVerifier(topic),
    onSuccess: () => {
      setPendingUnbind(null);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
    },
  });

  const entries = Object.entries(verifiers);
  if (entries.length === 0) return null;
  return (
    <div
      data-testid="topic-verifiers"
      style={{
        marginTop: 'var(--tai-space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
      }}
    >
      <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Topic verifiers</h3>
      {entries.map(([topic, binding]) => {
        const configKeys = Object.keys(binding.config);
        return (
          <div
            key={topic}
            data-testid={`topic-verifier-${topic}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--tai-space-2)',
              flexWrap: 'wrap',
            }}
          >
            <Badge variant="neutral">{topic}</Badge>
            <span style={{ color: 'var(--tai-color-text-muted)' }}>verified by</span>
            <Badge variant="primary">{binding.verifier}</Badge>
            {configKeys.length > 0 ? (
              <span
                style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
              >
                config: {configKeys.join(', ')}
              </span>
            ) : null}
            <Button
              variant="danger"
              aria-label={`Unbind verifier from ${topic}`}
              onClick={() => {
                setPendingUnbind(topic);
              }}
            >
              Unbind
            </Button>
          </div>
        );
      })}
      {pendingUnbind !== null ? (
        <Dialog
          open
          title="Unbind topic verifier"
          description={`Unbind the verifier from "${pendingUnbind}"? Its webhook ingress becomes OPEN — unauthenticated requests are accepted until a verifier is bound again.`}
          onOpenChange={(next) => {
            if (!next) setPendingUnbind(null);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
            {unbindMutation.isError ? (
              <ErrorState message={errorMessage(unbindMutation.error)} />
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-3)' }}>
              <Button
                onClick={() => {
                  setPendingUnbind(null);
                }}
                disabled={unbindMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  unbindMutation.mutate(pendingUnbind);
                }}
                disabled={unbindMutation.isPending}
              >
                {unbindMutation.isPending ? <Spinner label="Unbinding" /> : null}
                Unbind verifier
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

export function HooksList({ topic }: { topic: string }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const trimmedTopic = topic.trim();
  const query = useQuery({
    queryKey: hooksListKey(trimmedTopic),
    queryFn: ({ signal }) => api.listHooks(trimmedTopic === '' ? undefined : trimmedTopic, signal),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.unregisterHook(name),
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
    },
  });

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  } else if (query.data.items.length === 0) {
    body = (
      <EmptyState
        title="No hooks registered"
        description="Register a hook below to fire a tool when a topic is published."
      />
    );
  } else {
    body = (
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Topic</TH>
            <TH>Tool</TH>
            <TH>Gates</TH>
            <TH aria-label="Actions" />
          </TR>
        </THead>
        <TBody>
          {query.data.items.map((hook) => (
            <TR key={hook.name}>
              <TD>{hook.name}</TD>
              <TD>{hook.topic}</TD>
              <TD>{hook.tool}</TD>
              <TD>
                <div style={{ display: 'flex', gap: 'var(--tai-space-1)' }}>
                  {hasCondition(hook) ? <Badge variant="primary">condition</Badge> : null}
                  {hasExpr(hook) ? <Badge variant="neutral">expr</Badge> : null}
                </div>
              </TD>
              <TD style={{ textAlign: 'right' }}>
                <Button
                  variant="danger"
                  aria-label={`Delete hook ${hook.name}`}
                  onClick={() => {
                    setPendingDelete(hook.name);
                  }}
                >
                  Delete
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    );
  }

  return (
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Registered hooks
      </h2>
      {body}
      <TopicVerifiers verifiers={query.data?.topic_verifiers ?? {}} />
      {pendingDelete !== null ? (
        <Dialog
          open
          title="Delete hook"
          description={`Unregister the hook "${pendingDelete}"? This cannot be undone.`}
          onOpenChange={(next) => {
            if (!next) setPendingDelete(null);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
            {deleteMutation.isError ? (
              <ErrorState message={errorMessage(deleteMutation.error)} />
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-3)' }}>
              <Button
                onClick={() => {
                  setPendingDelete(null);
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteMutation.mutate(pendingDelete);
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Spinner label="Deleting" /> : null}
                Delete hook
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}

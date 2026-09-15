/**
 * Display of the per-topic verifier bindings the `/api/hooks` response carries, with
 * a per-topic UNBIND control. Each row shows the topic and the verifier bound to it;
 * the config's KEYS are listed (they never hold secret values, only a `secret_env`
 * name), never its values. Renders nothing when no topic has a bound verifier.
 *
 * Unbind runs behind a confirm dialog (the consequence is stated plainly: an unbound
 * topic's ingress is OPEN/unauthenticated) that calls `api.deleteTopicVerifier`;
 * success invalidates the whole hooks list. A 404 surfaces loudly — never swallowed.
 */
import { Badge, Button, ConfirmDialog, useApi } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { HOOKS_KEY_ROOT } from './keys';

/** A topic's bound verifier plus its config (a `secret_env` name, never a secret). */
export interface TopicVerifier {
  readonly verifier: string;
  readonly config: Record<string, unknown>;
}

export function TopicVerifiers({
  verifiers,
}: {
  readonly verifiers: Record<string, TopicVerifier>;
}): ReactNode {
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
              variant="ghost"
              aria-label={`Unbind verifier from ${topic}`}
              onClick={() => {
                unbindMutation.reset();
                setPendingUnbind(topic);
              }}
            >
              Unbind
            </Button>
          </div>
        );
      })}
      {pendingUnbind !== null ? (
        <ConfirmDialog
          title="Unbind topic verifier"
          confirmLabel="Unbind verifier"
          pendingLabel="Unbinding"
          onConfirm={() => {
            unbindMutation.mutate(pendingUnbind);
          }}
          onClose={() => {
            setPendingUnbind(null);
          }}
          isPending={unbindMutation.isPending}
          error={unbindMutation.isError ? unbindMutation.error : null}
        >
          <p style={{ margin: 0 }}>
            Unbind the verifier from &ldquo;{pendingUnbind}&rdquo;? Its webhook ingress becomes OPEN
            — unauthenticated requests are accepted until a verifier is bound again.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

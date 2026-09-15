/**
 * The registered-hooks list. Reads `api.listHooks` through TanStack Query, keyed on
 * the active `topic` filter so the query refetches whenever the filter changes
 * (empty = list all). Each row ({@link HookRow}) has an Edit door
 * ({@link EditHookDialog}) and a Delete door ({@link DeleteHookDialog}). The
 * per-topic verifier bindings render below as {@link TopicVerifiers}.
 *
 * Server state is surfaced loudly: loading → `Skeleton`, empty → `EmptyState`, and
 * any failed request → an always-visible `ErrorState` — never a silent empty render.
 */
import type { HookList, HookParams, TriggerAuth } from '@tai42/api-client';
import {
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TH,
  THead,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { DeleteHookDialog } from './DeleteHookDialog';
import { EditHookDialog } from './EditHookDialog';
import { HookRow } from './HookRow';
import { hooksListKey } from './keys';
import { TopicVerifiers } from './TopicVerifiers';

/** A topic's server-derived door; `undefined` when the list omits it. */
function topicDoor(doors: HookList['trigger_auth'], topic: string): TriggerAuth | undefined {
  return Object.hasOwn(doors, topic) ? doors[topic] : undefined;
}

export function HooksList({ topic }: { topic: string }): ReactNode {
  const api = useApi();

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<HookParams | null>(null);

  const trimmedTopic = topic.trim();
  const query = useQuery({
    queryKey: hooksListKey(trimmedTopic),
    queryFn: ({ signal }) => api.listHooks(trimmedTopic === '' ? undefined : trimmedTopic, signal),
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
    // Schema-defaulted for real responses; guarded for a raw/stub payload that omits it.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- stubs bypass the schema default
    const doors = query.data.trigger_auth ?? {};
    body = (
      <ScrollRegion label="Hooks">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Topic</TH>
              <TH>Tool</TH>
              <TH>Runs as</TH>
              <TH>Trigger auth</TH>
              <TH>Gates</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {query.data.items.map((hook) => (
              <HookRow
                key={hook.name}
                hook={hook}
                door={topicDoor(doors, hook.topic)}
                onEdit={setPendingEdit}
                onDelete={setPendingDelete}
              />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
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
        <DeleteHookDialog
          name={pendingDelete}
          onClose={() => {
            setPendingDelete(null);
          }}
        />
      ) : null}
      {pendingEdit !== null ? (
        <EditHookDialog
          hook={pendingEdit}
          onClose={() => {
            setPendingEdit(null);
          }}
        />
      ) : null}
    </Card>
  );
}

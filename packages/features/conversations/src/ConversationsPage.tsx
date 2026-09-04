/**
 * The `/conversations` feature page: the cross-channel conversation monitor.
 *
 * Read-only, and a drill-down in three levels driven entirely by the URL — a bare
 * `/conversations` is the route picker, `?route=` is that route's threads, and
 * `?route=&thread=` opens one thread's transcript beside the list. Every level is
 * therefore linkable and survives a reload.
 *
 * A `thread` with no `route` names nothing the API can be asked for. Rather than
 * render a state that cannot exist, the page REPAIRS the URL — the source of
 * truth — back to the legal search.
 */
import { useEffect, type ReactNode } from 'react';
import { PageHeader, Stack, Tabs, useAppNavigate, type PageProps } from '@tai42/studio-sdk';

import { ConfigsTable } from './ConfigsTable';
import { FailedMessages } from './FailedMessages';
import { useSelectionFocus } from './focus';
import { RoutesTable, routeRowLabel } from './RoutesTable';
import { RouteThreads } from './RouteThreads';
import { sanitizeSearch } from './search';

export function ConversationsPage({ search }: PageProps<'conversations'>): ReactNode {
  const navigate = useAppNavigate();
  const cleaned = sanitizeSearch(search);
  const repaired = cleaned !== search;
  const { route, thread, status, address, q } = cleaned;
  const focus = useSelectionFocus(route, routeRowLabel);

  // An illegal pair can only arrive from the URL (a shared or hand-edited link).
  // While one is on screen `sanitizeSearch` is building a fresh object every
  // render, so the effect depends on the repaired VALUES rather than that object's
  // identity: it re-navigates once per illegal URL, not once per render.
  //
  // The repair REPLACES the history entry, because it is a move the reader did not
  // make. Pushing it would leave the illegal URL behind Back, where Back repairs
  // and pushes again — a page that cannot be left backwards.
  useEffect(() => {
    if (repaired)
      navigate('conversations', { route, thread, status, address, q }, { replace: true });
  }, [repaired, route, thread, status, address, q, navigate]);

  return (
    <Stack gap={6}>
      <PageHeader
        eyebrow="Activity"
        title="Conversations"
        description="Threads and transcripts from every conversation route — the API door and each channel medium."
      />
      {route === undefined ? (
        // The monitor's landing: the route picker plus the two admin surfaces that
        // span every route — the per-target config editor and the failed-delivery
        // listing. They are tabs (not stacked sections) so only the open one reads
        // its door: on a no-backend deployment each shows its own "off" note, and
        // three of those stacked would be noise; and the picker stays the default,
        // so a drill back always lands on it. The tab is ephemeral admin state, not
        // a URL param — the linkable state here is the route/thread drill, which
        // leaves this landing entirely.
        <Tabs
          items={[
            {
              value: 'routes',
              label: 'Routes',
              content: <RoutesTable listRef={focus.listRef} />,
            },
            { value: 'configs', label: 'Per-target configs', content: <ConfigsTable /> },
            { value: 'failed', label: 'Failed deliveries', content: <FailedMessages /> },
          ]}
        />
      ) : (
        <RouteThreads
          route={route}
          thread={thread}
          status={status}
          address={address}
          q={q}
          search={cleaned}
          headingRef={focus.headingRef}
        />
      )}
    </Stack>
  );
}

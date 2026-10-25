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
 *
 * A `config` (no `route`) opens the landing's "Per-target configs" tab and marks that
 * config's row, so a config is linkable too.
 */
import { PageHeader, type PageProps, Stack, Tabs, useAppNavigate } from '@tai42/studio-sdk';
import { type ReactNode, useEffect } from 'react';

import { ConfigsTable } from './ConfigsTable';
import { FailedMessages } from './FailedMessages';
import { useSelectionFocus } from './focus';
import { routeRowLabel, RoutesTable } from './RoutesTable';
import { RouteThreads } from './RouteThreads';
import { sanitizeSearch } from './search';

export function ConversationsPage({ search }: PageProps<'conversations'>): ReactNode {
  const navigate = useAppNavigate();
  const cleaned = sanitizeSearch(search);
  const repaired = cleaned !== search;
  const { route, thread, status, address, q, config } = cleaned;
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
      navigate('conversations', { route, thread, status, address, q, config }, { replace: true });
  }, [repaired, route, thread, status, address, q, config, navigate]);

  return (
    <Stack gap={6}>
      <PageHeader
        eyebrow="Doors"
        title="Conversations"
        description="Threads and transcripts from every conversation route — the API door and each channel medium."
      />
      {route === undefined ? (
        // The monitor's landing: the route picker plus the two admin surfaces that
        // span every route — the per-target config editor and the failed-delivery
        // listing. They are tabs (not stacked sections) so only the open one reads
        // its door: on a no-backend deployment each shows its own "off" note, and
        // three of those stacked would be noise; and the picker stays the default,
        // so a drill back always lands on it. A `config` link opens the configs tab
        // on that config's row; otherwise the open tab is ephemeral admin state.
        <Tabs
          key={config ?? ''}
          defaultValue={config !== undefined ? 'configs' : 'routes'}
          items={[
            {
              value: 'routes',
              label: 'Routes',
              content: <RoutesTable listRef={focus.listRef} />,
            },
            {
              value: 'configs',
              label: 'Per-target configs',
              content: <ConfigsTable highlight={config} />,
            },
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

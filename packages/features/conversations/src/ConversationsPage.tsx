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
import { PageHeader, Stack, useAppNavigate, type PageProps } from '@tai42/studio-sdk';

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
        <RoutesTable listRef={focus.listRef} />
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

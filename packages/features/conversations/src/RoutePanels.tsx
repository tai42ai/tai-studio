/**
 * The plugin route-panel slot on a route's drill-in. A channel plugin contributes a
 * panel for its channel's routes (`registerRoutePanel`); this host names no channel.
 *
 * `RouteThreads` hands only the route NAME, so the slot looks the route up in the shared
 * route catalogue (the route picker's query, same cache key) to learn its door and
 * channel. It renders nothing until that read resolves to a `channel`-door row whose
 * channel has a committed panel the caller's projection covers. Core routes never wait
 * on the plugin pass: until it is `ready` the slot is empty, and it re-renders off the
 * host-state store once the pass commits. A throwing panel is contained in the SDK's
 * error card, named by the panel's title.
 */
import {
  Card,
  ErrorBoundary,
  errorMessage,
  ErrorState,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { contributionCovered, usePluginContributions } from '@tai42/studio-sdk/host';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { conversationRoutesKey } from './keys';

export function RoutePanels({ route }: { readonly route: string }): ReactNode {
  const api = useApi();
  const { state } = useCapabilities();
  const { status, contributions } = usePluginContributions();
  const routes = useQuery({
    queryKey: conversationRoutesKey,
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
  });

  // On the drill-in this slot is the only consumer of the route catalogue — the route
  // picker that otherwise surfaces this read's failure is unmounted here — so its error
  // is surfaced rather than swallowed.
  if (routes.isError) {
    return (
      <Card>
        <ErrorState message={errorMessage(routes.error)} onRetry={() => void routes.refetch()} />
      </Card>
    );
  }

  const row = routes.data?.items.find((item) => item.route_name === route);
  if (row?.door !== 'channel' || status !== 'ready' || state.status !== 'ready') return null;
  const panel = contributions.routePanels.get(row.channel);
  if (panel === undefined || !contributionCovered(state.projection, panel.requiredCapabilities)) {
    return null;
  }
  const Panel = panel.component;
  return (
    <section aria-label={panel.title}>
      <ErrorBoundary label={panel.title}>
        <Panel pluginId={panel.pluginId} route={row} />
      </ErrorBoundary>
    </section>
  );
}

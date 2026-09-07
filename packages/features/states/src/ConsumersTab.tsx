/**
 * The Consumers tab: everything that binds this state — flows, hooks, schedules and
 * agents — read from the union of registered listers (`GET /api/states/{name}/consumers`).
 * A consumer whose FAMILY cannot be listed on this deployment (e.g. no scheduling
 * backend) is surfaced as a muted line, never swallowed. A bound consumer with a link
 * opens its own screen: a feature token (hooks / scheduling / agents) navigates in-shell,
 * a plugin path opens the plugin's screen.
 */
import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
  useAppNavigate,
  usePluginNavigation,
  type RouteSearch,
  type RouteToken,
} from '@tai42/studio-sdk';
import type { ConsumerRow, StateDetail } from '@tai42/api-client';

import { stateConsumersKey } from './keys';

/** The feature tokens a consumer link may target in-shell (hooks / scheduling / agents,
 * plus presets for a preset whose fixed tool names include a `state_*` builtin). */
const LINK_TOKENS: ReadonlySet<string> = new Set(['hooks', 'scheduling', 'agents', 'presets']);

/** Split a plugin path `<pluginId>/<pagePath>` (a leading `/plugins/` is tolerated). */
function splitPluginPath(raw: string): { pluginId: string; pagePath: string } | null {
  const trimmed = raw.replace(/^\/plugins\//, '').replace(/^\//, '');
  const slash = trimmed.indexOf('/');
  if (slash < 0) return null;
  return { pluginId: trimmed.slice(0, slash), pagePath: trimmed.slice(slash + 1) };
}

export function ConsumersTab({ state }: { readonly state: StateDetail }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const { navigatePlugin } = usePluginNavigation();

  const query = useQuery({
    queryKey: stateConsumersKey(state.name),
    queryFn: ({ signal }) => api.stateConsumers(state.name, signal),
  });

  if (query.isError && isFeatureDisabled(query.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(query.error)} />;
  }

  const openLink = (row: ConsumerRow): void => {
    const link = row.link;
    if (link === null) return;
    if (link.token !== null && LINK_TOKENS.has(link.token)) {
      navigate(link.token as RouteToken, (link.search ?? {}) as RouteSearch<RouteToken>);
      return;
    }
    if (link.plugin_path !== null) {
      const parsed = splitPluginPath(link.plugin_path);
      if (parsed !== null) {
        navigatePlugin(parsed.pluginId, parsed.pagePath, undefined, link.search ?? undefined);
      }
    }
  };

  const canOpen = (row: ConsumerRow): boolean => {
    const link = row.link;
    if (link === null) return false;
    if (link.token !== null && LINK_TOKENS.has(link.token)) return true;
    return link.plugin_path !== null && splitPluginPath(link.plugin_path) !== null;
  };

  if (query.isPending) return <Skeleton height={160} />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const rows = query.data;
  const bound = rows.filter((row) => row.unavailable === null);
  const unavailable = rows.filter((row) => row.unavailable !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {unavailable.map((row, index) => (
        <p
          key={`${row.kind}:${index.toString()}`}
          style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}
          data-testid={`consumer-unavailable-${row.kind}`}
        >
          {row.kind === 'schedule'
            ? 'Schedules: no scheduling backend on this deployment.'
            : `${row.kind}: ${row.unavailable ?? 'unavailable'}`}
        </p>
      ))}

      {bound.length === 0 ? (
        <EmptyState
          title="Nothing binds this state yet"
          description="No consumer reads or writes this state yet."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Kind</TH>
              <TH>Name</TH>
              <TH>Detail</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {bound.map((row, index) => (
              <TR key={`${row.kind}:${row.name ?? ''}:${index.toString()}`}>
                <TD>
                  <Badge variant="neutral">{row.kind}</Badge>
                </TD>
                <TD>{row.name ?? '—'}</TD>
                <TD>{row.detail ?? '—'}</TD>
                <TD>
                  {canOpen(row) ? (
                    <Button
                      type="button"
                      onClick={() => {
                        openLink(row);
                      }}
                      aria-label={`Open ${row.kind} ${row.name ?? ''}`.trim()}
                    >
                      Open
                    </Button>
                  ) : (
                    '—'
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

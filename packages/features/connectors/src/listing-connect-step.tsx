/**
 * The connect flow's Connect step for a marketplace listing: read the listing's
 * detail, install it in place, report the reload, then wait until this Studio sees
 * what the install added. A listing with a `connector` item waits for its provider
 * (a connector item's name is its provider id) and then shows the connect form for
 * it; a listing of `mcp-server` items waits until the status read lists each item
 * name (an entry title) as bound or failed, and then hands the titles on.
 *
 * The wait checks every 2 s and on "Check again". It gives up loudly at once when
 * the reload converged and a check made after it still misses, and otherwise after
 * {@link INSTALL_SETTLE_TIMEOUT_MS}; a wait that gave up checks no more until
 * "Check again" starts it over.
 */
import {
  type MarketplaceInstallResult,
  type MarketplacePluginDetail,
  type MarketplaceSearchRow,
  type ProviderView,
  summarizeFleetFanout,
} from '@tai42/api-client';
import {
  Button,
  errorMessage,
  ErrorState,
  InstallReport,
  marketplacePluginKey,
  mcpStatusKey,
  PluginInstallPanel,
  Spinner,
  useApi,
} from '@tai42/studio-sdk';
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { ConnectForm } from './connect-form';
import { PROVIDERS_KEY } from './keys';
import type { OnConnected } from './use-connect-form';
import type { McpStatusView } from './use-directory';

/** How long the step waits for the installed plugin to show before it gives up. */
export const INSTALL_SETTLE_TIMEOUT_MS = 60_000;

const SETTLE_POLL_MS = 2_000;

/** What the install must make visible before the flow goes on. */
export type SettleTarget =
  | { readonly kind: 'provider'; readonly providerId: string }
  | { readonly kind: 'servers'; readonly titles: readonly string[] };

/**
 * The wait target of a listing's latest version: its first `connector` item's
 * provider, else every `mcp-server` item's entry title; `null` when it holds neither.
 */
export function settleTargetOf(detail: MarketplacePluginDetail): SettleTarget | null {
  const items = detail.latest?.items ?? [];
  const connector = items.find((item) => item.kind === 'connector');
  if (connector !== undefined) return { kind: 'provider', providerId: connector.name };
  const titles = items.filter((item) => item.kind === 'mcp-server').map((item) => item.name);
  return titles.length > 0 ? { kind: 'servers', titles } : null;
}

interface Settle {
  readonly gaveUp: boolean;
  readonly checkNow: () => void;
  readonly restart: () => void;
}

interface SettleRead<T> {
  readonly queryKey: QueryKey;
  readonly queryFn: QueryFunction<T>;
  /** Whether a read shows what the install added. */
  readonly isFound: (data: T) => boolean;
}

/**
 * The wait: its read and its clock. The read polls until it finds what the install
 * added or the wait gives up; a check is a refetch this hook started, so "a check
 * made after the reload" never counts a read that answered before it.
 */
function useSettle<T>(
  { queryKey, queryFn, isFound }: SettleRead<T>,
  converged: boolean,
): { readonly query: UseQueryResult<T>; readonly found: boolean; readonly settle: Settle } {
  const [checked, setChecked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [round, setRound] = useState(0);
  const roundRef = useRef(0);
  const over = timedOut || (converged && checked);
  const query = useQuery({
    queryKey,
    queryFn,
    refetchInterval: ({ state }) =>
      over || (state.data !== undefined && isFound(state.data)) ? false : SETTLE_POLL_MS,
  });
  const found = query.data !== undefined && isFound(query.data);
  const { refetch } = query;

  const checkNow = useCallback((): void => {
    const started = roundRef.current;
    void refetch().then(() => {
      if (roundRef.current === started) setChecked(true);
    });
  }, [refetch]);

  useEffect(() => {
    checkNow();
  }, [checkNow, round]);

  useEffect(() => {
    if (found) return undefined;
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, INSTALL_SETTLE_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [found, round]);

  useEffect(
    () => () => {
      roundRef.current += 1;
    },
    [],
  );

  const restart = useCallback((): void => {
    roundRef.current += 1;
    setChecked(false);
    setTimedOut(false);
    setRound((n) => n + 1);
  }, []);

  return { query, found, settle: { gaveUp: !found && over, checkNow, restart } };
}

function WaitView({
  name,
  missing,
  query,
  settle,
  onClose,
}: {
  name: string;
  missing: string;
  query: UseQueryResult;
  settle: Settle;
  onClose: () => void;
}): ReactNode {
  const readFailure = query.isError ? <ErrorState message={errorMessage(query.error)} /> : null;
  if (settle.gaveUp) {
    return (
      <>
        {readFailure}
        <ErrorState
          message={`${name} was installed, but this server does not list ${missing} yet.`}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button onClick={settle.restart}>Check again</Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </>
    );
  }
  return (
    <>
      {readFailure}
      <Spinner label={`Waiting for the workers to load ${name}…`} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={settle.checkNow}>Check again</Button>
      </div>
    </>
  );
}

function ProviderWait({
  name,
  providerId,
  converged,
  onConnected,
  onSetClientCredentials,
  onClose,
}: {
  name: string;
  providerId: string;
  converged: boolean;
  onConnected: OnConnected;
  onSetClientCredentials: (provider: ProviderView) => void;
  onClose: () => void;
}): ReactNode {
  const api = useApi();
  const [found, setFound] = useState<ProviderView | null>(null);
  const { query, settle } = useSettle(
    {
      queryKey: PROVIDERS_KEY,
      queryFn: ({ signal }) => api.listProviders(signal),
      isFound: (data) => data.providers.some((provider) => provider.id === providerId),
    },
    converged,
  );
  const listed = query.data?.providers.find((provider) => provider.id === providerId) ?? null;
  useEffect(() => {
    if (found === null && listed !== null) setFound(listed);
  }, [found, listed]);

  if (found !== null) {
    return (
      <ConnectForm
        provider={found}
        onConnected={onConnected}
        onCancel={onClose}
        onSetClientCredentials={onSetClientCredentials}
      />
    );
  }
  return (
    <WaitView name={name} missing={providerId} query={query} settle={settle} onClose={onClose} />
  );
}

/** The titles the status read lists neither as bound nor as failed. */
function missingTitles(titles: readonly string[], status: McpStatusView): string[] {
  const listed = new Set([
    ...Object.keys(status.bound),
    ...status.failed.map((record) => record.title),
  ]);
  return titles.filter((title) => !listed.has(title));
}

function ServersWait({
  name,
  titles,
  converged,
  onServersReady,
  onClose,
}: {
  name: string;
  titles: readonly string[];
  converged: boolean;
  onServersReady: (titles: readonly string[]) => void;
  onClose: () => void;
}): ReactNode {
  const api = useApi();
  const [handedOn, setHandedOn] = useState(false);
  const { query, found, settle } = useSettle(
    {
      queryKey: mcpStatusKey,
      queryFn: ({ signal }) => api.getMcpStatus(signal),
      isFound: (data) => missingTitles(titles, data).length === 0,
    },
    converged,
  );
  const missing = query.data === undefined ? titles : missingTitles(titles, query.data);
  useEffect(() => {
    if (found && !handedOn) {
      setHandedOn(true);
      onServersReady(titles);
    }
  }, [found, handedOn, onServersReady, titles]);

  if (found) return null;
  return (
    <WaitView
      name={name}
      missing={missing.join(', ')}
      query={query}
      settle={settle}
      onClose={onClose}
    />
  );
}

interface Installed {
  readonly result: MarketplaceInstallResult;
  readonly target: SettleTarget | null;
}

export function ListingConnectStep({
  listing,
  onConnected,
  onServersReady,
  onSetClientCredentials,
  onClose,
}: {
  readonly listing: MarketplaceSearchRow;
  readonly onConnected: OnConnected;
  /** The installed listing's entry titles, once the status read lists every one. */
  readonly onServersReady: (titles: readonly string[]) => void;
  readonly onSetClientCredentials: (provider: ProviderView) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const name = listing.display_name ?? listing.name;
  const detail = useQuery({
    queryKey: marketplacePluginKey(listing.ref),
    queryFn: ({ signal }) => api.getMarketplacePlugin(listing.namespace, listing.name, signal),
  });
  const [installed, setInstalled] = useState<Installed | null>(null);

  if (installed === null) {
    if (detail.isError) {
      return (
        <ErrorState
          message={errorMessage(detail.error)}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      );
    }
    if (detail.data === undefined) return <Spinner label={`Reading ${name}`} />;
    const data = detail.data;
    return (
      <PluginInstallPanel
        refValue={listing.ref}
        version={data.latest?.version ?? null}
        detail={data}
        onInstalled={(result) => {
          setInstalled({ result, target: settleTargetOf(data) });
          void queryClient.invalidateQueries();
        }}
        onDismiss={onClose}
      />
    );
  }

  const { reload } = installed.result;
  const summary = summarizeFleetFanout(
    reload.fanout,
    reload.awaiting_respawn,
    reload.span_release_error,
  );
  const converged = summary?.status === 'converged' && reload.awaiting_respawn.length === 0;
  const { target } = installed;
  let wait: ReactNode;
  if (target === null) {
    wait = (
      <ErrorState
        message={`${name} was installed, but its listing names no connector or MCP server.`}
      />
    );
  } else if (target.kind === 'provider') {
    wait = (
      <ProviderWait
        name={name}
        providerId={target.providerId}
        converged={converged}
        onConnected={onConnected}
        onSetClientCredentials={onSetClientCredentials}
        onClose={onClose}
      />
    );
  } else {
    wait = (
      <ServersWait
        name={name}
        titles={target.titles}
        converged={converged}
        onServersReady={onServersReady}
        onClose={onClose}
      />
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <InstallReport summary={summary} recycle={reload.recycle} />
      {wait}
    </div>
  );
}

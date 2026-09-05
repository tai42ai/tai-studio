/**
 * MCP servers section of the unified Connectors page — two surfaces over the
 * mounted MCP servers:
 *
 *  1. STATUS: `GET /api/mcp-status` lists every mounted server (bound = healthy,
 *     failed = errored) with a per-server RELOAD button (`POST …/reload`).
 *  2. CONFIG: an editor for the manifest's `mcp` array with two views over the
 *     SAME working list. The FORM view (primary) renders one editor per entry: a
 *     schema-driven `SchemaForm` for the transport config plus a tool COMPOSER for
 *     the `include`/`exclude` lists (pick a discovered tool, optionally stack
 *     extensions into a `tool:ext[:ext]` token). Connector-OWNED entries (the
 *     `managed` back-reference a connect flow writes) render READ-ONLY with delete
 *     disabled — they are kept in sync by their connection, so the only way to
 *     remove one is to disconnect. The JSON view (escape hatch) is a raw `Textarea`;
 *     a malformed edit is a LOUD inline field error and no request is sent.
 *     Switching views serializes/parses the working list, and — when there are
 *     unsaved edits — first asks to confirm so nothing is silently lost. Both
 *     views save through `POST /api/mcp-config`, whose server-side
 *     `Manifest.model_validate` is the single gate; a 400 renders as ESCAPED
 *     text in the loud error surface.
 *
 * Dirtiness is reported (`useRegisterDirty`) to the `DirtyGuardBoundary` this section
 * mounts, so a route navigation away or a full-page unload confirms before the fleet-
 * reloading config is dropped unsaved.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  failedMcpsFromReport,
  isFleetReportFailure,
  summarizeFleetFanout,
  summarizeFleetResult,
} from '@tai42/api-client';
import type {
  ConnectorRef,
  Extension,
  FailedMcpEntry,
  FleetReportSummary,
  McpEnvRef,
} from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  CloseIcon,
  ConfirmDialog,
  Dialog,
  DirtyGuardBoundary,
  EmptyState,
  ErrorState,
  ExtensionPicker,
  Field,
  FleetReport,
  RecordEntryRendererContext,
  SchemaForm,
  ScrollRegion,
  SecretRefField,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  ToolPicker,
  defaultValueForSchema,
  errorMessage,
  useApi,
  useCanWrite,
  useRegisterDirty,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import type { JsonSchema, RecordEntryContext, RecordEntryRenderer } from '@tai42/studio-sdk';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  envConfigKey,
  installedMarketplacePluginsKey,
  manifestKey,
  mcpConfigSchemaKey,
  mcpEnvRefsKey,
  mcpExtensionsKey,
  mcpFailedKey,
  mcpStatusKey,
  preservedManifestKey,
} from './keys';

interface ServerRow {
  readonly title: string;
  readonly healthy: boolean;
  readonly detail: string;
}

function ServerStatusTable({ rows }: { rows: readonly ServerRow[] }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  // Every per-title reload resolves to the same templated-route gate, so one
  // static-placeholder check covers the table (a door that can only refuse is
  // never offered).
  const canReload = useCanWrite('/api/mcp-status/{title}/reload', 'POST');
  const reload = useMutation({
    mutationFn: (title: string) => api.reloadMcp(title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpStatusKey }),
  });

  return (
    <>
      <ScrollRegion label="MCP servers">
        <Table>
          <THead>
            <TR>
              <TH>Server</TH>
              <TH>Status</TH>
              <TH>Detail</TH>
              <TH>
                <span className="tai-visually-hidden">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => {
              const pending = reload.isPending && reload.variables === row.title;
              return (
                <TR key={row.title}>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{row.title}</TD>
                  <TD>
                    <Badge variant={row.healthy ? 'success' : 'danger'}>
                      {row.healthy ? 'bound' : 'failed'}
                    </Badge>
                  </TD>
                  <TD>{row.detail}</TD>
                  <TD>
                    {canReload ? (
                      <Button
                        type="button"
                        onClick={() => {
                          reload.mutate(row.title);
                        }}
                        disabled={pending}
                      >
                        {pending ? <Spinner label={`Reloading ${row.title}`} /> : null}
                        Reload
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </ScrollRegion>
      {reload.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(reload.error)} />
        </div>
      ) : null}
      {/* A single-MCP reload broadcasts to the fleet; surface any failed propagation
          honestly (nothing on a converged reload). */}
      {reload.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={summarizeFleetResult(reload.data)} action="reload" />
        </div>
      ) : null}
    </>
  );
}

function McpStatusSection(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: mcpStatusKey,
    queryFn: ({ signal }) => api.getMcpStatus(signal),
  });

  if (query.isPending) return <Skeleton height={72} />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  // The MOUNTED table lists the servers that BOUND successfully; the ones the
  // viability check skipped live in the dedicated failed-servers health section
  // below (with their own remediation), so a failure is never buried in a status row.
  const rows: ServerRow[] = Object.entries(query.data.bound).map(([title, tools]) => ({
    title,
    healthy: true,
    detail: `${String(tools.length)} tool${tools.length === 1 ? '' : 's'}`,
  }));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No MCP servers are bound"
        description="Add a server in the config below, then save. Servers that fail to bind appear under Failed servers."
      />
    );
  }

  return <ServerStatusTable rows={rows} />;
}

/** One failed-server row: its title, coarse status, and the per-server remediation
 *  (Reload re-probes it; Deregister — a destructive detach — asks the house confirm).
 *  Each affordance is gated on its OWN door: a caller whose projection cannot reach
 *  `<verb> path` is never shown a control that can only 403 on submit (projection ⊆
 *  gate). The per-server routes are DYNAMIC (`/api/mcp-status/{title}/…`), which a
 *  scoped projection can carry only as a method-less pattern, so — following the house
 *  approach for a templated write route — the interpolated path resolves to a
 *  full-projection gate; under-showing a scoped caller's control is safe. */
function FailedServerRow({
  entry,
  onReload,
  reloadPending,
  onDeregister,
}: {
  readonly entry: FailedMcpEntry;
  readonly onReload: (title: string) => void;
  readonly reloadPending: boolean;
  readonly onDeregister: (title: string) => void;
}): ReactNode {
  const canReload = useCanWrite(`/api/mcp-status/${entry.title}/reload`, 'POST');
  const canDeregister = useCanWrite(`/api/mcp-status/${entry.title}/deregister`, 'POST');
  return (
    <TR>
      <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{entry.title}</TD>
      <TD>
        <Badge variant="danger">{entry.status}</Badge>
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          {canReload ? (
            <Button
              type="button"
              onClick={() => {
                onReload(entry.title);
              }}
              disabled={reloadPending}
            >
              {reloadPending ? <Spinner label={`Reloading ${entry.title}`} /> : null}
              Reload
            </Button>
          ) : null}
          {canDeregister ? (
            <Button
              type="button"
              variant="danger"
              aria-label={`Deregister ${entry.title}`}
              onClick={() => {
                onDeregister(entry.title);
              }}
            >
              Deregister
            </Button>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}

/**
 * The failed-MCP health section: the servers the viability check skipped, read from
 * the fleet-wide `GET /api/mcp-status/failed` door (a server failed on ANY worker is
 * listed). Each row carries Reload (re-probe one) and Deregister (detach one's tools,
 * a destructive op behind the house confirm); a Reload-all-failed button re-probes the
 * whole roster. Every remediation invalidates both the failed roster and the mounted
 * status, since a re-attached server moves between the two views. An empty roster is a
 * quiet healthy state — the section renders nothing.
 */
function FailedServersSection(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [deregisterTarget, setDeregisterTarget] = useState<string | null>(null);
  // A deregister that landed but whose fleet broadcast did NOT converge keeps the
  // confirm dialog open showing the honest report in context (mirrors ConnectDialog),
  // so the operator sees the stranded worker and closes explicitly. `null` on a
  // converged (or lone-worker) detach, which closes the dialog.
  const [deregisterReport, setDeregisterReport] = useState<FleetReportSummary | null>(null);
  // Reload-all rides a CONCRETE, method-expressible route, so it gates exactly on
  // `POST /api/mcp-status/reload-failed` (projection ⊆ gate); the per-row Reload and
  // Deregister gates live in `FailedServerRow` on their own dynamic doors.
  const canReloadAll = useCanWrite('/api/mcp-status/reload-failed', 'POST');

  const query = useQuery({
    queryKey: mcpFailedKey,
    queryFn: ({ signal }) => api.listFailedMcps(signal),
  });

  const invalidateStatus = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: mcpFailedKey });
    await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
  };

  const reload = useMutation({
    mutationFn: (title: string) => api.reloadMcp(title),
    onSuccess: invalidateStatus,
  });
  const reloadAll = useMutation({
    mutationFn: () => api.reloadFailedMcps(),
    onSuccess: invalidateStatus,
  });
  const deregister = useMutation({
    mutationFn: (title: string) => api.deregisterMcp(title),
    onSuccess: async (result) => {
      await invalidateStatus();
      const summary = summarizeFleetResult(result);
      if (isFleetReportFailure(summary)) {
        // Non-converged: keep the dialog open rendering the report in context.
        setDeregisterReport(summary);
        return;
      }
      // Converged (or lone-worker) detach: close the dialog.
      setDeregisterReport(null);
      setDeregisterTarget(null);
    },
  });

  if (query.isPending) return <Skeleton height={72} />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const failed = failedMcpsFromReport(query.data);
  if (failed.length === 0) return null;

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          marginBottom: 'var(--tai-space-3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Failed servers</h2>
        {canReloadAll ? (
          <Button
            type="button"
            onClick={() => {
              reloadAll.mutate();
            }}
            disabled={reloadAll.isPending}
          >
            {reloadAll.isPending ? <Spinner label="Reloading all failed servers" /> : null}
            Reload all failed
          </Button>
        ) : null}
      </div>
      <ScrollRegion label="Failed MCP servers">
        <Table>
          <THead>
            <TR>
              <TH>Server</TH>
              <TH>Status</TH>
              <TH>
                <span className="tai-visually-hidden">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {failed.map((entry) => (
              <FailedServerRow
                key={entry.title}
                entry={entry}
                onReload={(title) => {
                  reload.mutate(title);
                }}
                reloadPending={reload.isPending && reload.variables === entry.title}
                onDeregister={(title) => {
                  // A shared mutation drives every row's confirm, so clear any stale error
                  // and any prior fleet report before opening (the reset-on-open precedent).
                  deregister.reset();
                  setDeregisterReport(null);
                  setDeregisterTarget(title);
                }}
              />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
      {reload.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(reload.error)} />
        </div>
      ) : null}
      {reloadAll.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(reloadAll.error)} />
        </div>
      ) : null}
      {/* Each remediation broadcasts to the fleet; surface any failed propagation
          honestly (nothing on a converged / lone-worker op). */}
      {reload.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={summarizeFleetResult(reload.data)} action="reload" />
        </div>
      ) : null}
      {reloadAll.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={summarizeFleetResult(reloadAll.data)} action="reload" />
        </div>
      ) : null}
      {deregisterTarget !== null ? (
        <ConfirmDialog
          title="Deregister MCP server"
          confirmLabel="Deregister"
          pendingLabel={`Deregistering ${deregisterTarget}`}
          onConfirm={() => {
            deregister.mutate(deregisterTarget);
          }}
          onClose={() => {
            setDeregisterTarget(null);
            setDeregisterReport(null);
          }}
          isPending={deregister.isPending}
          error={deregister.error}
        >
          <p style={{ margin: 0 }}>
            Detach{' '}
            <strong style={{ fontFamily: 'var(--tai-font-mono)' }}>{deregisterTarget}</strong> and
            its tools from the live registry? This leaves the manifest entry in place — reload it
            once the server is healthy to re-attach.
          </p>
          {/* A deregister detaches one server's tools ACROSS the fleet; a partial fan-out
              (detached on worker A, still live on worker B) must never close the dialog
              silently. On a non-converged detach the honest report stays in the dialog so
              the operator sees the stranded worker in context and closes explicitly; a
              converged detach closed the dialog and shows nothing. */}
          {deregisterReport !== null ? (
            <div style={{ marginTop: 'var(--tai-space-3)' }}>
              <FleetReport summary={deregisterReport} action="deregister" />
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

type ConfigView = 'form' | 'json';

/** A plain object view of one entry, tolerating a loose/absent shape. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The string members of a possibly-absent, possibly-loose array field. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** The connector back-reference on a managed entry, or `null` for a hand-authored one. */
function connectorRefOf(entry: unknown): ConnectorRef | null {
  const managed = asRecord(entry).managed;
  const ref = asRecord(managed);
  if (
    typeof ref.connection_id === 'string' &&
    typeof ref.provider_id === 'string' &&
    typeof ref.sub_service === 'string'
  ) {
    return {
      connection_id: ref.connection_id,
      provider_id: ref.provider_id,
      sub_service: ref.sub_service,
    };
  }
  return null;
}

/** The base tool name a composed `tool:ext[:ext]` token was built from. */
function baseToolOf(token: string): string {
  const separator = token.indexOf(':');
  return separator === -1 ? token : token.slice(0, separator);
}

// The manifest stores a secret env reference as an `!ENV ${KEY}` leaf (the
// `pyaml_env`-resolved marker the preserved read round-trips intact). These map
// that wire form to/from a bare key name at the SecretRefField boundary; the
// server's shared validator — not this parse — is the authority on danglers.
const ENV_MARKER = /^!ENV\s+\$\{([^}]+)\}$/;

/** The referenced env key of an `!ENV ${KEY}` leaf, or `null` for anything else. */
function parseEnvMarker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = ENV_MARKER.exec(value);
  return match === null ? null : (match[1] ?? null);
}

/** The `!ENV ${KEY}` leaf that references env key `key`. */
function formatEnvMarker(key: string): string {
  return `!ENV \${${key}}`;
}

/** Every env key an `!ENV ${KEY}` leaf anywhere under `value` references. */
function collectEnvRefs(value: unknown): Set<string> {
  const refs = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      const key = parseEnvMarker(node);
      if (key !== null) refs.add(key);
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (typeof node === 'object' && node !== null) {
      for (const nested of Object.values(node)) walk(nested);
    }
  };
  walk(value);
  return refs;
}

/**
 * The leaf value at a slash-separated manifest pointer (`mcp/0/env/KEY`) — the same
 * pointer form the combined paste op targets — or `undefined` when any segment does
 * not resolve. Array segments index by number; object segments key by name.
 */
function resolveManifestPointer(root: unknown, pointer: string): unknown {
  let node: unknown = root;
  for (const segment of pointer.split('/')) {
    if (Array.isArray(node)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return undefined;
      node = node[index];
    } else if (typeof node === 'object' && node !== null) {
      if (!Object.hasOwn(node, segment)) return undefined;
      node = (node as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * Whether a record entry belongs to an `env` map (the secret-bearing map on an MCP
 * entry) — its containing record field is named `env`. The renderer mounts the
 * masked SecretRefField for these and the built-in value editor for every other map.
 */
function isEnvEntry(entry: RecordEntryContext): boolean {
  const boundary = entry.path.lastIndexOf('.');
  if (boundary === -1) return false;
  const parent = entry.path.slice(0, boundary);
  return parent === 'env' || parent.endsWith('.env');
}

/**
 * A shallow clone of an object schema with `fields` removed from `properties` and
 * `required`, so the schema-driven form renders the transport config only and the
 * tool lists / provenance are handled by dedicated surfaces (rather than as raw
 * free-text string arrays). Non-object schemas pass through untouched.
 */
function stripSchemaFields(schema: JsonSchema, fields: readonly string[]): JsonSchema {
  const record = asRecord(schema);
  const properties = record.properties;
  if (typeof properties !== 'object' || properties === null) return schema;
  const nextProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    if (!fields.includes(key)) nextProperties[key] = value;
  }
  const next: Record<string, unknown> = { ...record, properties: nextProperties };
  if (Array.isArray(record.required)) {
    next.required = record.required.filter(
      (key) => typeof key !== 'string' || !fields.includes(key),
    );
  }
  return next;
}

const STRIPPED_FIELDS = ['include', 'exclude', 'managed'] as const;

/** Parse the raw JSON buffer into an MCP array, raising a loud message on any
 *  problem. Shared by the JSON-view save and the JSON→form switch. */
function parseEntries(text: string): { entries: unknown[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `Invalid JSON: ${errorMessage(error)}` };
  }
  if (!Array.isArray(parsed)) {
    return { error: 'The MCP config must be a JSON array of server entries.' };
  }
  return { entries: parsed };
}

/** One removable token chip (a composed `tool:ext[:ext]` string). */
function ToolChip({
  token,
  onRemove,
}: {
  readonly token: string;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--tai-space-1)' }}>
      <Badge variant="neutral">{token}</Badge>
      <Button
        type="button"
        variant="secondary"
        aria-label={`Remove ${token}`}
        onClick={onRemove}
        style={{ padding: '0 var(--tai-space-2)' }}
      >
        <CloseIcon />
      </Button>
    </span>
  );
}

/**
 * Editor for one tool list on an MCP entry (`include` or `exclude`). Existing
 * tokens render as removable chips — even ones no longer in the discovered set (a
 * server that is currently down), so the operator is never locked out of removing
 * their own config. The add row selects a discovered tool; the `include` list adds
 * an extension COMPOSER on top, stacking extensions into a `tool:ext[:ext]` token.
 */
function ToolListEditor({
  legend,
  description,
  values,
  discoveredTools,
  extensions,
  extensionsError,
  composer,
  idPrefix,
  onChange,
}: {
  readonly legend: string;
  readonly description: string;
  readonly values: readonly string[];
  readonly discoveredTools: readonly string[];
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly composer: boolean;
  readonly idPrefix: string;
  readonly onChange: (next: string[]) => void;
}): ReactNode {
  const [base, setBase] = useState<string | null>(null);
  const [exts, setExts] = useState<readonly string[]>([]);
  // A discovered MCP tool may carry no overlay row yet, so the picker falls back to
  // the bare raw name; a mapped one shows its human display name.
  const displayNames = useToolDisplayNames();

  const token =
    base === null || base === ''
      ? ''
      : composer && exts.length > 0
        ? [base, ...exts].join(':')
        : base;
  const duplicate = token !== '' && values.includes(token);

  const add = (): void => {
    if (token === '' || duplicate) return;
    onChange([...values, token]);
    setBase(null);
    setExts([]);
  };
  const remove = (target: string): void => {
    onChange(values.filter((value) => value !== target));
  };

  // `exclude` cannot list the same tool twice; `include` can (a base tool with
  // different extension stacks), so only the non-composer list excludes its picks.
  const excludeNames = composer ? undefined : values.map(baseToolOf);

  return (
    <fieldset
      data-testid={idPrefix}
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
      }}
    >
      <legend style={{ padding: 0, fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
        {legend}
      </legend>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--tai-text-sm)',
          color: 'var(--tai-color-text-muted)',
        }}
      >
        {description}
      </p>

      {values.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-2)' }}>
          {values.map((value) => (
            <ToolChip
              key={value}
              token={value}
              onRemove={() => {
                remove(value);
              }}
            />
          ))}
        </div>
      ) : null}

      {discoveredTools.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--tai-text-sm)',
            color: 'var(--tai-color-text-muted)',
          }}
        >
          No discovered tools for this server yet — it may be offline. Existing entries above stay
          editable.
        </p>
      ) : (
        <ToolPicker
          toolNames={discoveredTools}
          value={base}
          onChange={setBase}
          excludeNames={excludeNames}
          placeholder="Choose a tool…"
          aria-label={`${legend}: choose a tool`}
          idPrefix={`${idPrefix}-tool`}
          displayNames={displayNames}
        />
      )}

      {composer && discoveredTools.length > 0 ? (
        <>
          {extensionsError !== undefined ? (
            <ErrorState message={extensionsError} />
          ) : (
            <ExtensionPicker
              available={extensions}
              value={[...exts]}
              onChange={setExts}
              disabled={base === null || base === ''}
              idPrefix={`${idPrefix}-extensions`}
            />
          )}
          <p
            style={{
              margin: 0,
              fontSize: 'var(--tai-text-sm)',
              color: 'var(--tai-color-text-muted)',
            }}
          >
            New entry: <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{token || '—'}</span>
          </p>
        </>
      ) : null}

      {discoveredTools.length > 0 ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={add}
            disabled={token === '' || duplicate}
          >
            Add to {legend.toLowerCase()}
          </Button>
          {duplicate ? (
            <span
              style={{
                marginLeft: 'var(--tai-space-2)',
                fontSize: 'var(--tai-text-sm)',
                color: 'var(--tai-color-text-muted)',
              }}
            >
              Already in the list.
            </span>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * The `!ENV` marker checklist for one MCP entry — NAMES and set/unset only, derived
 * ENTIRELY from `get_mcp_env_refs` (no env value is ever fetched or rendered). A ref
 * resolves (green) when the var is set OR carries a `:default`; a bare unset var is
 * drift (red) — the marker would not resolve. "Set" links to the environment editor,
 * the one door that reads and writes the values. Renders for installer-written AND
 * hand-written marker-bearing entries alike (a platform surface, not an mcp-kind one).
 */
function EnvRefsChecklist({ refs }: { readonly refs: readonly McpEnvRef[] }): ReactNode {
  if (refs.length === 0) return null;
  return (
    <div style={{ marginTop: 'var(--tai-space-3)' }}>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--tai-text-sm)',
          fontWeight: 600,
          marginBottom: 'var(--tai-space-2)',
        }}
      >
        Environment
      </span>
      <ul className="tai-stack tai-stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {refs.map((ref) => {
          const resolves = ref.set || ref.has_default;
          const state = ref.set ? 'set' : ref.has_default ? 'default' : 'unset';
          return (
            <li
              key={ref.pointer}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--tai-space-2)',
                minWidth: 0,
              }}
            >
              <Badge variant={resolves ? 'success' : 'danger'}>{state}</Badge>
              <code style={{ fontFamily: 'var(--tai-font-mono)' }}>{ref.var}</code>
              {resolves ? null : (
                <span className="tai-status-warn" style={{ fontSize: 'var(--tai-text-sm)' }}>
                  the marker will not resolve
                </span>
              )}
              <AppLink to="settings" aria-label={`Set ${ref.var} in the environment editor`}>
                Set
              </AppLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A marketplace-installed MCP entry, rendered READ-ONLY. Its `title` matches an
 * installed mcp-server item name (the installer refuses title collisions, so a
 * match IS that install), so edit + delete are disabled — uninstalling the plugin
 * is the only way to remove it. Distinct from `ManagedEntryCard`: an install has no
 * `ConnectorRef`, and "uninstall to remove" is the honest recourse, not "disconnect".
 */
function InstalledEntryCard({
  entry,
  index,
  installedRef,
  refs,
}: {
  readonly entry: unknown;
  readonly index: number;
  readonly installedRef: string;
  readonly refs: readonly McpEnvRef[];
}): ReactNode {
  const record = asRecord(entry);
  const rawTitle = record.title;
  const title =
    typeof rawTitle === 'string' && rawTitle !== '' ? rawTitle : `Server ${String(index + 1)}`;
  const include = stringArray(record.include);
  return (
    <Card style={{ background: 'var(--tai-color-surface)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          marginBottom: 'var(--tai-space-2)',
        }}
      >
        <span style={{ fontWeight: 600, fontFamily: 'var(--tai-font-mono)' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          <Badge variant="primary">Installed</Badge>
          <Button
            type="button"
            variant="danger"
            disabled
            aria-label={`Remove server ${String(index + 1)}`}
          >
            Remove
          </Button>
        </div>
      </div>
      <p
        role="note"
        style={{ margin: 0, fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
      >
        Installed from {installedRef} — uninstall to remove
      </p>
      {include.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--tai-space-1)',
            marginTop: 'var(--tai-space-2)',
          }}
        >
          {include.map((tool) => (
            <Badge key={tool} variant="neutral">
              {tool}
            </Badge>
          ))}
        </div>
      ) : null}
      <EnvRefsChecklist refs={refs} />
    </Card>
  );
}

/**
 * A connector-owned MCP entry, rendered READ-ONLY. Its scopes, tokens, and URLs
 * are kept in sync by the connection that wrote it, so the editor surfaces the
 * provenance and disables removal — the only way to remove it is to disconnect.
 */
function ManagedEntryCard({
  entry,
  index,
  managed,
}: {
  readonly entry: unknown;
  readonly index: number;
  readonly managed: ConnectorRef;
}): ReactNode {
  const record = asRecord(entry);
  const rawTitle = record.title;
  const title =
    typeof rawTitle === 'string' && rawTitle !== '' ? rawTitle : `Server ${String(index + 1)}`;
  const include = stringArray(record.include);
  return (
    <Card style={{ background: 'var(--tai-color-surface)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          marginBottom: 'var(--tai-space-2)',
        }}
      >
        <span style={{ fontWeight: 600, fontFamily: 'var(--tai-font-mono)' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          <Badge variant="primary">Managed</Badge>
          <Button
            type="button"
            variant="danger"
            disabled
            aria-label={`Remove server ${String(index + 1)}`}
          >
            Remove
          </Button>
        </div>
      </div>
      <p
        role="note"
        style={{
          margin: 0,
          fontSize: 'var(--tai-text-sm)',
          color: 'var(--tai-color-text-muted)',
        }}
      >
        Managed by connection {managed.connection_id} (provider {managed.provider_id},{' '}
        {managed.sub_service}). Disconnect to remove.
      </p>
      {include.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--tai-space-1)',
            marginTop: 'var(--tai-space-2)',
          }}
        >
          {include.map((tool) => (
            <Badge key={tool} variant="neutral">
              {tool}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/** An editable, hand-authored MCP entry: transport config + include/exclude composer. */
function EditableEntryCard({
  entry,
  index,
  formSchema,
  discoveredTools,
  extensions,
  extensionsError,
  availableSecretKeys,
  keyPickingAvailable,
  dirty,
  refs,
  onPasteSecret,
  onChange,
  onRemove,
}: {
  readonly entry: unknown;
  readonly index: number;
  readonly formSchema: JsonSchema;
  readonly discoveredTools: readonly string[];
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly availableSecretKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly dirty: boolean;
  readonly refs: readonly McpEnvRef[];
  readonly onPasteSecret: (manifestPointer: string, keyHint: string, secret: string) => void;
  readonly onChange: (next: unknown) => void;
  readonly onRemove: () => void;
}): ReactNode {
  const record = asRecord(entry);

  // The value renderer the schema-form consults for every `record` entry. Only the
  // MCP entry's `env` map is secret-bearing: those entries mount the masked
  // SecretRefField, mapping a `key` ref to the `!ENV ${KEY}` leaf and a pasted
  // secret to the combined env+manifest op targeted at this entry's manifest
  // pointer (head `mcp`). Every other map keeps the built-in value editor.
  const renderRecordEntry: RecordEntryRenderer = (recordEntry) => {
    if (!isEnvEntry(recordEntry)) return recordEntry.defaultField;
    const referencedKey = parseEnvMarker(recordEntry.value);
    // Pasting a new secret runs the combined op against THIS entry's manifest
    // pointer, so it is safe only when the editor index matches the saved manifest
    // (no unsaved edits) and the entry already has a key to hint the generated name.
    // Referencing an existing key stays available in both cases.
    const pasteDisabledReason = dirty
      ? 'Save changes before adding a secret'
      : recordEntry.keyName.trim() === ''
        ? 'Name this variable before adding a secret'
        : undefined;
    return (
      <SecretRefField
        value={referencedKey === null ? undefined : { source: 'key', key: referencedKey }}
        availableKeys={availableSecretKeys}
        keyPickingAvailable={keyPickingAvailable}
        pasteDisabledReason={pasteDisabledReason}
        label={recordEntry.keyName === '' ? 'Secret value' : recordEntry.keyName}
        idPrefix={`mcp-secret-${String(index)}-${recordEntry.keyName}`}
        onChange={(ref) => {
          if (ref.source === 'key') {
            recordEntry.onChange(formatEnvMarker(ref.key));
            return;
          }
          onPasteSecret(
            `mcp/${String(index)}/${recordEntry.path.replaceAll('.', '/')}`,
            recordEntry.keyName,
            ref.secret,
          );
        }}
      />
    );
  };

  return (
    <Card style={{ background: 'var(--tai-color-surface)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--tai-space-3)',
        }}
      >
        <span style={{ fontWeight: 600 }}>Server {String(index + 1)}</span>
        <Button
          type="button"
          variant="danger"
          aria-label={`Remove server ${String(index + 1)}`}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        {/* The transport config (title/config/extensions) rides the generic form; the
            unknown-to-the-form `include`/`exclude`/`managed` keys are preserved by
            ObjectFields' merge and edited through the dedicated surfaces below. The
            renderer mounts SecretRefField for the `env` map's entries. */}
        <RecordEntryRendererContext.Provider value={renderRecordEntry}>
          <SchemaForm
            schema={formSchema}
            value={entry}
            onChange={onChange}
            idPrefix={`mcp-entry-${String(index)}`}
          />
        </RecordEntryRendererContext.Provider>
        <ToolListEditor
          legend="Included tools"
          description="Bind only these tools from this server. Optionally stack extensions onto a tool."
          values={stringArray(record.include)}
          discoveredTools={discoveredTools}
          extensions={extensions}
          extensionsError={extensionsError}
          composer
          idPrefix={`mcp-entry-${String(index)}-include`}
          onChange={(next) => {
            onChange({ ...record, include: next });
          }}
        />
        <ToolListEditor
          legend="Excluded tools"
          description="Suppress these tools from this server."
          values={stringArray(record.exclude)}
          discoveredTools={discoveredTools}
          extensions={extensions}
          extensionsError={extensionsError}
          composer={false}
          idPrefix={`mcp-entry-${String(index)}-exclude`}
          onChange={(next) => {
            onChange({ ...record, exclude: next });
          }}
        />
        {/* Any `!ENV` markers this hand-written entry carries get the same names-only
            checklist the installed entries render (a platform surface). */}
        <EnvRefsChecklist refs={refs} />
      </div>
    </Card>
  );
}

/** The form-view list of entries: managed + installed entries read-only, hand-authored editable. */
function EntryList({
  schema,
  entries,
  discoveredTools,
  extensions,
  extensionsError,
  availableSecretKeys,
  keyPickingAvailable,
  dirty,
  installedMcpRefs,
  refsByTitle,
  onPasteSecret,
  onChange,
}: {
  readonly schema: JsonSchema;
  readonly entries: readonly unknown[];
  readonly discoveredTools: Readonly<Record<string, readonly string[]>>;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly availableSecretKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly dirty: boolean;
  // title → installed listing ref (`namespace/name`) for installer-written entries.
  readonly installedMcpRefs: ReadonlyMap<string, string>;
  // title → its `!ENV` marker refs, keyed off the SAVED manifest's entry titles.
  readonly refsByTitle: ReadonlyMap<string, readonly McpEnvRef[]>;
  readonly onPasteSecret: (manifestPointer: string, keyHint: string, secret: string) => void;
  readonly onChange: (entries: unknown[]) => void;
}): ReactNode {
  const formSchema = stripSchemaFields(schema, STRIPPED_FIELDS);
  // The marker checklist reflects SAVED server state and is keyed by title (stable
  // identity), so it survives a working-list reorder that would drift an index.
  const refsFor = (entry: unknown): readonly McpEnvRef[] => {
    const title = asRecord(entry).title;
    return typeof title === 'string' ? (refsByTitle.get(title) ?? []) : [];
  };
  const installedRefFor = (entry: unknown): string | undefined => {
    const title = asRecord(entry).title;
    return typeof title === 'string' ? installedMcpRefs.get(title) : undefined;
  };
  const setEntry = (index: number, next: unknown): void => {
    onChange(entries.map((entry, position) => (position === index ? next : entry)));
  };
  const removeEntry = (index: number): void => {
    onChange(entries.filter((_, position) => position !== index));
  };
  const addEntry = (): void => {
    onChange([...entries, defaultValueForSchema(formSchema)]);
  };

  const toolsFor = (entry: unknown): readonly string[] => {
    const title = asRecord(entry).title;
    return typeof title === 'string' ? (discoveredTools[title] ?? []) : [];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {entries.length === 0 ? (
        <EmptyState
          title="No MCP servers configured"
          description="Add a server, fill in its details, then save."
        />
      ) : null}
      {entries.map((entry, index) => {
        const managed = connectorRefOf(entry);
        // Index keys are correct here: entries have no stable identity and the whole
        // list is one controlled value re-rendered on every edit.
        if (managed !== null) {
          return <ManagedEntryCard key={index} entry={entry} index={index} managed={managed} />;
        }
        // A title matching an installed mcp-server item name IS that install
        // (the installer refuses title collisions): render it read-only so hand
        // edits cannot clobber an entry the installer owns.
        const installedRef = installedRefFor(entry);
        if (installedRef !== undefined) {
          return (
            <InstalledEntryCard
              key={index}
              entry={entry}
              index={index}
              installedRef={installedRef}
              refs={refsFor(entry)}
            />
          );
        }
        return (
          <EditableEntryCard
            key={index}
            entry={entry}
            index={index}
            formSchema={formSchema}
            discoveredTools={toolsFor(entry)}
            extensions={extensions}
            extensionsError={extensionsError}
            availableSecretKeys={availableSecretKeys}
            keyPickingAvailable={keyPickingAvailable}
            dirty={dirty}
            refs={refsFor(entry)}
            onPasteSecret={onPasteSecret}
            onChange={(next) => {
              setEntry(index, next);
            }}
            onRemove={() => {
              removeEntry(index);
            }}
          />
        );
      })}
      <div>
        <Button type="button" variant="secondary" onClick={addEntry}>
          Add server
        </Button>
      </div>
    </div>
  );
}

function McpConfigEditor({
  initialEntries,
  schema,
  discoveredTools,
  extensions,
  extensionsError,
  availableSecretKeys,
  keyPickingAvailable,
  installedMcpRefs,
  refsByTitle,
}: {
  readonly initialEntries: readonly Record<string, unknown>[];
  readonly schema: JsonSchema;
  readonly discoveredTools: Readonly<Record<string, readonly string[]>>;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly availableSecretKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly installedMcpRefs: ReadonlyMap<string, string>;
  readonly refsByTitle: ReadonlyMap<string, readonly McpEnvRef[]>;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  // The Save door: `POST /api/mcp-config` is the single gate every view persists
  // through, so gate the Save affordance on it (projection ⊆ gate). A door that can
  // only refuse is never offered; while the projection is loading/failed this is
  // false (fail closed), so Save stays hidden until the caller is known to reach it.
  const canSave = useCanWrite('/api/mcp-config', 'POST');

  // The exact env keys THIS editor generated through its own pastes. A paste's server
  // half writes a fresh `!ENV ${KEY}` marker at the paste pointer; on success we resolve
  // that pointer against the re-read preserved manifest and record the key here. This is
  // the ONLY reliable signal that a key originated with this editor — the combined-op
  // response carries a COUNT (`env_keys`), not the generated name — and it is the sole
  // set the save-time orphan sweep may delete. A key picked, pre-existing, or created by
  // another session is never recorded here, so it can never be swept.
  const sessionGeneratedKeysRef = useRef<Set<string>>(new Set());

  // Two views over one working list. The FORM view drives `entries`; the JSON
  // view drives `text`. A view switch converts one into the other so neither
  // goes stale. `baseline` is the server config as it currently stands — used to
  // detect unsaved edits before a lossy-looking switch.
  const baseline = JSON.stringify(initialEntries);
  const [view, setView] = useState<ConfigView>('form');
  const [entries, setEntries] = useState<unknown[]>(() => [...initialEntries]);
  const [text, setText] = useState(() => JSON.stringify(initialEntries, null, 2));
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [confirmTarget, setConfirmTarget] = useState<ConfigView | null>(null);
  // Set when the server config moved under UNSAVED edits that differ from it — a
  // real conflict, so the draft is kept and this flags it rather than clobbering it.
  const [conflict, setConflict] = useState(false);

  // The signature of the current working list in whichever view is active, comparable
  // to `baseline`/`seededFrom` (compact JSON of the entry array). An unparseable JSON
  // buffer is its own signature so it counts as diverged, never as a silent match.
  const draftSignature = ((): string => {
    if (view === 'form') return JSON.stringify(entries);
    const parsed = parseEntries(text);
    return 'error' in parsed ? `error:${text}` : JSON.stringify(parsed.entries);
  })();

  // The combined env+manifest op for a PASTED secret: the server writes the
  // env value FIRST, then the `!ENV ${KEY}` manifest leaf at `manifest_pointer`
  // (head `mcp`) SECOND — atomically, one reload/broadcast. The env moved and the
  // marker landed in the manifest, so both the env config and both manifest views
  // are re-read. The generated key rides back on the preserved re-read.
  const secretEnv = useMutation({
    mutationFn: (body: Parameters<typeof api.setMcpSecretEnv>[0]) => api.setMcpSecretEnv(body),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: envConfigKey });
      await queryClient.invalidateQueries({ queryKey: preservedManifestKey });
      await queryClient.invalidateQueries({ queryKey: manifestKey });
      await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
      // Record the key the server just generated for THIS paste. After the preserved
      // re-read above lands, the leaf at the paste pointer is the `!ENV ${KEY}` marker
      // the server wrote; parse it back to the bare key. Only a key captured here is
      // eligible for the save-time orphan sweep. A leaf that does not resolve to a marker
      // records nothing — a safe miss that leaves an orphan rather than risking deletion
      // of a key this editor did not generate.
      const leaf = resolveManifestPointer(
        queryClient.getQueryData(preservedManifestKey),
        variables.manifest_pointer,
      );
      const generatedKey = parseEnvMarker(leaf);
      if (generatedKey !== null) sessionGeneratedKeysRef.current.add(generatedKey);
    },
  });
  const onPasteSecret = (manifestPointer: string, keyHint: string, secret: string): void => {
    secretEnv.mutate({ value: secret, key_hint: keyHint, manifest_pointer: manifestPointer });
  };

  const save = useMutation({
    mutationFn: async ({ mcp, orphanedKeys }: { mcp: unknown[]; orphanedKeys: string[] }) => {
      // MANIFEST-FIRST for the orphan cleanup: the marker is dropped from the
      // manifest before its generated env key is deleted, so the window can only ever
      // hold an inert orphan key — never a dangling `!ENV` reference the shared
      // validator would refuse. The delete rides the env editor's blank-value path.
      const result = await api.setMcpConfig(mcp);
      for (const key of orphanedKeys) await api.setEnvConfig({ [key]: '' });
      return result;
    },
    onSuccess: async (_result, { orphanedKeys }) => {
      // A save moves BOTH manifest views: the editor's preserved read (its own
      // seed) and the resolved read ManifestTab renders. Dropping either strands
      // that surface on stale data.
      await queryClient.invalidateQueries({ queryKey: preservedManifestKey });
      await queryClient.invalidateQueries({ queryKey: manifestKey });
      await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
      // The env config only moved when a generated secret key was cleaned up.
      if (orphanedKeys.length > 0) {
        await queryClient.invalidateQueries({ queryKey: envConfigKey });
      }
    },
  });

  // The buffers are re-seeded when the server config MOVES (a save that normalizes it,
  // or a background/focus refetch) DURING RENDER — React's adjust-state-on-prop-change
  // pattern — rather than by remounting on a `key`: this editor is what writes the
  // config, so a remount keyed on it tears the editor down the instant its own save
  // lands, dropping the keyboard caret from the Save button onto `document.body`
  // (WCAG 2.4.3) and deleting the "Saved" badge and fleet report the save just
  // produced. Re-seeding also leaves the operator in the view they chose.
  //
  // A move is ADOPTED only when it is safe: the draft carries no unsaved edits (it still
  // matches the OLD server), or the draft already equals the NEW server (this editor's
  // own just-saved config comes back this way). A move that lands while the draft holds
  // unsaved edits that differ from it is a genuine CONFLICT — the draft is kept and
  // surfaced, never silently replaced.
  const [seededFrom, setSeededFrom] = useState(baseline);
  if (seededFrom !== baseline) {
    const adopt = draftSignature === seededFrom || draftSignature === baseline;
    setSeededFrom(baseline);
    if (adopt) {
      setEntries([...initialEntries]);
      setText(JSON.stringify(initialEntries, null, 2));
      setParseError(undefined);
      setConflict(false);
    } else {
      setConflict(true);
    }
  }

  const loadServerVersion = (): void => {
    setEntries([...initialEntries]);
    setText(JSON.stringify(initialEntries, null, 2));
    setParseError(undefined);
    setConflict(false);
  };

  const isDirty = (): boolean => draftSignature !== baseline;
  const dirty = isDirty();

  // Report to the enclosing DirtyGuardBoundary so a route navigation away or a
  // full-page unload confirms before the fleet-reloading config is dropped unsaved.
  useRegisterDirty(dirty);

  // Perform the actual switch, converting the working list across. A JSON→form
  // switch with an unparseable buffer stays in JSON and raises loudly rather
  // than dropping the edit.
  const switchTo = (next: ConfigView): void => {
    if (next === 'json') {
      setText(JSON.stringify(entries, null, 2));
      setParseError(undefined);
      setView('json');
      return;
    }
    const parsed = parseEntries(text);
    if ('error' in parsed) {
      setParseError(parsed.error);
      return;
    }
    setEntries(parsed.entries);
    setParseError(undefined);
    setView('form');
  };

  const requestView = (next: ConfigView): void => {
    if (next === view) return;
    if (isDirty()) {
      setConfirmTarget(next);
      return;
    }
    switchTo(next);
  };

  // The generated secret keys this save strands. A key qualifies only when it is
  // (a) referenced by an `!ENV ${KEY}` leaf in the server manifest but no longer by any
  // leaf in the config being saved, AND (b) one this editor generated via its own paste.
  // A key not generated here — picked, pre-existing, or created by another session — is
  // never in the generated set, so it is NEVER deleted; at worst it is left as a harmless
  // env orphan.
  const orphanedKeysOf = (next: unknown[]): string[] => {
    const before = collectEnvRefs(initialEntries);
    const after = collectEnvRefs(next);
    return [...before].filter((key) => !after.has(key) && sessionGeneratedKeysRef.current.has(key));
  };

  const onSave = (): void => {
    if (view === 'json') {
      const parsed = parseEntries(text);
      if ('error' in parsed) {
        setParseError(parsed.error);
        return;
      }
      setParseError(undefined);
      save.mutate({ mcp: parsed.entries, orphanedKeys: orphanedKeysOf(parsed.entries) });
      return;
    }
    save.mutate({ mcp: entries, orphanedKeys: orphanedKeysOf(entries) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <div
        role="group"
        aria-label="Config view"
        style={{ display: 'flex', gap: 'var(--tai-space-1)' }}
      >
        <Button
          type="button"
          variant={view === 'form' ? 'primary' : 'secondary'}
          aria-pressed={view === 'form'}
          onClick={() => {
            requestView('form');
          }}
        >
          Form
        </Button>
        <Button
          type="button"
          variant={view === 'json' ? 'primary' : 'secondary'}
          aria-pressed={view === 'json'}
          onClick={() => {
            requestView('json');
          }}
        >
          JSON
        </Button>
      </div>

      {conflict ? (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-2)',
            padding: 'var(--tai-space-3)',
            borderRadius: 'var(--tai-radius-md)',
            border: '1px solid var(--tai-color-warn-fill)',
            background: 'var(--tai-color-warn-tint)',
            color: 'var(--tai-color-warn-text)',
            fontSize: 'var(--tai-text-sm)',
          }}
        >
          <span>
            The MCP config changed on the server while you had unsaved edits. Your draft is kept —
            saving overwrites the server version.
          </span>
          <div>
            <Button type="button" variant="secondary" onClick={loadServerVersion}>
              Discard my draft and load the server version
            </Button>
          </div>
        </div>
      ) : null}

      {view === 'form' ? (
        <EntryList
          schema={schema}
          entries={entries}
          discoveredTools={discoveredTools}
          extensions={extensions}
          extensionsError={extensionsError}
          availableSecretKeys={availableSecretKeys}
          keyPickingAvailable={keyPickingAvailable}
          dirty={dirty}
          installedMcpRefs={installedMcpRefs}
          refsByTitle={refsByTitle}
          onPasteSecret={onPasteSecret}
          onChange={setEntries}
        />
      ) : (
        <Field
          label="MCP config"
          description="A JSON array of server entries. Saving replaces the mounted MCP config."
          error={parseError}
        >
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
            rows={12}
            spellCheck={false}
            style={{ fontFamily: 'var(--tai-font-mono)' }}
          />
        </Field>
      )}

      {canSave ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
          <Button type="button" variant="primary" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? <Spinner label="Saving config" /> : null}
            Save config
          </Button>
          {save.isSuccess ? (
            <Badge variant="success">Saved ({String(save.data.env_keys)} env keys)</Badge>
          ) : null}
        </div>
      ) : null}
      {/* The save persists then broadcasts a reload; surface any failed propagation
          honestly (nothing on a converged / lone-worker save). */}
      {save.isSuccess ? <FleetReport summary={summarizeFleetFanout(save.data.fanout)} /> : null}
      {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}
      {/* The combined op is server-gated by the shared X-band + dangling-`!ENV`
          validator; a refusal (or any failure) surfaces loudly, never swallowed. */}
      {secretEnv.isError ? <ErrorState message={errorMessage(secretEnv.error)} /> : null}

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        title="Discard unsaved changes?"
        description="You have unsaved edits. Switching views converts the current config across; continue?"
      >
        <div style={{ display: 'flex', gap: 'var(--tai-space-3)', justifyContent: 'flex-end' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setConfirmTarget(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              if (confirmTarget !== null) switchTo(confirmTarget);
              setConfirmTarget(null);
            }}
          >
            Switch view
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function McpConfigSection(): ReactNode {
  const api = useApi();
  // The editor reads and round-trips the PRESERVED manifest (`!ENV ${KEY}` markers
  // intact) — both the form view and the raw JSON view derive from these entries. A
  // resolved read would inline plaintext secret values, and a raw round-trip of that
  // would overwrite the references. ManifestTab keeps the resolved read.
  const manifest = useQuery({
    queryKey: preservedManifestKey,
    queryFn: ({ signal }) => api.getManifestPreserved(signal),
  });
  const schema = useQuery({
    queryKey: mcpConfigSchemaKey,
    queryFn: ({ signal }) => api.getMcpConfigSchema(signal),
  });
  // The discovered tools feed the include/exclude picker; shares the status query's
  // cache with the section above.
  const status = useQuery({
    queryKey: mcpStatusKey,
    queryFn: ({ signal }) => api.getMcpStatus(signal),
  });
  // The extension catalog feeds the include composer. A failed/absent catalog is a
  // soft degrade — the config stays editable and the failure is surfaced inline in
  // the composer — so an offline extensions route never walls the editor.
  const extensions = useQuery({
    queryKey: mcpExtensionsKey,
    queryFn: ({ signal }) => api.listExtensions(signal),
  });
  // The env config feeds SecretRefField's env-key picker (`secret_keys`) and gates
  // whether picking is offered at all. A caller whose projection cannot reach the
  // env route gets a failed query — the field FAILS CLOSED to paste-only rather than
  // walling the editor. `secret_keys` also scopes the orphan-key cleanup on save.
  const envConfig = useQuery({
    queryKey: envConfigKey,
    queryFn: ({ signal }) => api.getEnvConfig(signal),
  });
  // Provenance + marker checklist are AUXILIARY reads: a failure degrades the two
  // read-only surfaces (an installer-written entry falls back to editable, the
  // checklist is absent) but never walls the editor. No env VALUE is ever fetched —
  // the checklist is names + set/unset booleans only.
  const installed = useQuery({
    queryKey: installedMarketplacePluginsKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
  });
  const envRefs = useQuery({
    queryKey: mcpEnvRefsKey,
    queryFn: ({ signal }) => api.getMcpEnvRefs(signal),
  });

  if (manifest.isError || schema.isError) {
    const error = manifest.error ?? schema.error;
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void manifest.refetch();
          void schema.refetch();
        }}
      />
    );
  }
  if (manifest.isPending || schema.isPending) return <Skeleton height={220} />;

  const discoveredTools = status.isSuccess ? status.data.bound : {};
  const extensionsError = extensions.isError ? errorMessage(extensions.error) : undefined;

  const initialEntries = manifest.data.mcp;
  // title → installed listing ref, from every installed plugin's mcp-server items.
  const installedMcpRefs = new Map<string, string>();
  for (const row of installed.data?.installed ?? []) {
    for (const item of row.items) {
      if (item.kind === 'mcp-server') installedMcpRefs.set(item.name, row.ref);
    }
  }
  // title → its `!ENV` marker refs. The refs' `/mcp/<i>/...` pointer indexes the
  // SAVED manifest, so map each ref's index back to that entry's title and group.
  const refsByTitle = new Map<string, McpEnvRef[]>();
  for (const ref of envRefs.data ?? []) {
    const index = Number(ref.pointer.split('/')[2]);
    const title = asRecord(initialEntries[index]).title;
    if (typeof title !== 'string') continue;
    const existing = refsByTitle.get(title);
    if (existing === undefined) refsByTitle.set(title, [ref]);
    else existing.push(ref);
  }

  return (
    <McpConfigEditor
      initialEntries={initialEntries}
      schema={schema.data}
      discoveredTools={discoveredTools}
      extensions={extensions.data ?? []}
      extensionsError={extensionsError}
      availableSecretKeys={envConfig.data?.secret_keys ?? []}
      keyPickingAvailable={envConfig.isSuccess}
      installedMcpRefs={installedMcpRefs}
      refsByTitle={refsByTitle}
    />
  );
}

/**
 * The MCP-servers surface of the unified Connectors page: every sourced MCP server —
 * mounted status plus the manifest `mcp` config (hand-authored, marketplace-installed,
 * and connector-managed entries, each showing how it was added) — in one section, so
 * the operator sees all tool sources beside the provider connections below.
 */
export function McpServersSection(): ReactNode {
  return (
    // The config editor arms its dirty guard against this boundary (`useRegisterDirty`),
    // so leaving the page — or closing the tab — with unsaved MCP edits confirms first.
    <DirtyGuardBoundary>
      <section aria-label="MCP servers">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
          <Card>
            <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
              Mounted servers
            </h2>
            <McpStatusSection />
          </Card>
          <FailedServersSection />
          <Card>
            <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
              Configuration
            </h2>
            <McpConfigSection />
          </Card>
        </div>
      </section>
    </DirtyGuardBoundary>
  );
}

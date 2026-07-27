/**
 * MCP tab — two surfaces over the mounted MCP servers:
 *
 *  1. STATUS: `GET /api/mcp-status` lists every mounted server (bound = healthy,
 *     failed = errored) with a per-server RELOAD button (`POST …/reload`).
 *  2. CONFIG: an editor for the manifest's `mcp` array with two views over the
 *     SAME working list. The FORM view (primary) renders one schema-driven
 *     `SchemaForm` per entry from the entry schema (`GET /api/mcp-config/schema`)
 *     with add/edit/remove. The JSON view (escape hatch) is a raw `Textarea`; a
 *     malformed edit is a LOUD inline field error and no request is sent.
 *     Switching views serializes/parses the working list, and — when there are
 *     unsaved edits — first asks to confirm so nothing is silently lost. Both
 *     views save through `POST /api/mcp-config`, whose server-side
 *     `Manifest.model_validate` is the single gate; a 400 renders as ESCAPED
 *     text in the loud error surface.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { summarizeFleetFanout, summarizeFleetResult } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FleetReport,
  SchemaForm,
  ScrollRegion,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  defaultValueForSchema,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { JsonSchema } from '@tai42/studio-sdk';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { manifestKey, mcpConfigSchemaKey, mcpStatusKey } from '../keys';

interface ServerRow {
  readonly title: string;
  readonly healthy: boolean;
  readonly detail: string;
}

function ServerStatusTable({ rows }: { rows: readonly ServerRow[] }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
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
                  <TD>{row.title}</TD>
                  <TD>
                    <Badge variant={row.healthy ? 'success' : 'danger'}>
                      {row.healthy ? 'bound' : 'failed'}
                    </Badge>
                  </TD>
                  <TD>{row.detail}</TD>
                  <TD>
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

  const rows: ServerRow[] = [
    ...Object.entries(query.data.bound).map(([title, tools]) => ({
      title,
      healthy: true,
      detail: `${String(tools.length)} tool${tools.length === 1 ? '' : 's'}`,
    })),
    ...query.data.failed.map((entry) => ({
      title: entry.title,
      healthy: false,
      detail: entry.status,
    })),
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No MCP servers are mounted"
        description="Add a server in the config below, then save."
      />
    );
  }

  return <ServerStatusTable rows={rows} />;
}

type ConfigView = 'form' | 'json';

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

/** The form-view list of entries: one `SchemaForm` per entry, add and remove. */
function EntryList({
  schema,
  entries,
  onChange,
}: {
  readonly schema: JsonSchema;
  readonly entries: readonly unknown[];
  readonly onChange: (entries: unknown[]) => void;
}): ReactNode {
  const setEntry = (index: number, next: unknown): void => {
    onChange(entries.map((entry, position) => (position === index ? next : entry)));
  };
  const removeEntry = (index: number): void => {
    onChange(entries.filter((_, position) => position !== index));
  };
  const addEntry = (): void => {
    onChange([...entries, defaultValueForSchema(schema)]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {entries.length === 0 ? (
        <EmptyState
          title="No MCP servers configured"
          description="Add a server, fill in its details, then save."
        />
      ) : null}
      {entries.map((entry, index) => (
        <Card
          // Index keys are correct here: entries have no stable identity and the
          // whole list is one controlled value re-rendered on every edit.
          key={index}
          style={{ background: 'var(--tai-color-surface)' }}
        >
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
              onClick={() => {
                removeEntry(index);
              }}
            >
              Remove
            </Button>
          </div>
          <SchemaForm
            schema={schema}
            value={entry}
            onChange={(next) => {
              setEntry(index, next);
            }}
            idPrefix={`mcp-entry-${String(index)}`}
          />
        </Card>
      ))}
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
}: {
  readonly initialEntries: readonly Record<string, unknown>[];
  readonly schema: JsonSchema;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

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

  // Both buffers are re-seeded whenever the server config MOVES (a save that
  // normalizes it, or a background/focus refetch) so a stale edit can't clobber
  // newer server state. DURING RENDER — React's adjust-state-on-prop-change
  // pattern — rather than by remounting on a `key`: this editor is what writes
  // the config, so a remount keyed on it tears the editor down the instant its
  // own save lands, dropping the keyboard caret from the Save button onto
  // `document.body` (WCAG 2.4.3) and deleting the "Saved" badge and fleet report
  // the save just produced. Re-seeding also leaves the operator in the view they
  // chose, which a remount reset to Form.
  const [seededFrom, setSeededFrom] = useState(baseline);
  if (seededFrom !== baseline) {
    setSeededFrom(baseline);
    setEntries([...initialEntries]);
    setText(JSON.stringify(initialEntries, null, 2));
    setParseError(undefined);
  }

  const save = useMutation({
    mutationFn: (mcp: unknown[]) => api.setMcpConfig(mcp),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: manifestKey });
      await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
    },
  });

  const isDirty = (): boolean => {
    if (view === 'form') return JSON.stringify(entries) !== baseline;
    const parsed = parseEntries(text);
    return 'error' in parsed || JSON.stringify(parsed.entries) !== baseline;
  };

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

  const onSave = (): void => {
    if (view === 'json') {
      const parsed = parseEntries(text);
      if ('error' in parsed) {
        setParseError(parsed.error);
        return;
      }
      setParseError(undefined);
      save.mutate(parsed.entries);
      return;
    }
    save.mutate(entries);
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

      {view === 'form' ? (
        <EntryList schema={schema} entries={entries} onChange={setEntries} />
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <Button type="button" variant="primary" onClick={onSave} disabled={save.isPending}>
          {save.isPending ? <Spinner label="Saving config" /> : null}
          Save config
        </Button>
        {save.isSuccess ? (
          <Badge variant="success">Saved ({String(save.data.env_keys)} env keys)</Badge>
        ) : null}
      </div>
      {/* The save persists then broadcasts a reload; surface any failed propagation
          honestly (nothing on a converged / lone-worker save). */}
      {save.isSuccess ? <FleetReport summary={summarizeFleetFanout(save.data.fanout)} /> : null}
      {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}

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
  const manifest = useQuery({
    queryKey: manifestKey,
    queryFn: ({ signal }) => api.getManifest(signal),
  });
  const schema = useQuery({
    queryKey: mcpConfigSchemaKey,
    queryFn: ({ signal }) => api.getMcpConfigSchema(signal),
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

  return <McpConfigEditor initialEntries={manifest.data.mcp} schema={schema.data} />;
}

export function McpTab(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <Card>
        <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
          Mounted servers
        </h2>
        <McpStatusSection />
      </Card>
      <Card>
        <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
          Configuration
        </h2>
        <McpConfigSection />
      </Card>
    </div>
  );
}

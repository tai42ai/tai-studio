/**
 * The MCP config editor: two views over one working list (a schema-driven form and a
 * raw JSON escape hatch) saved through `POST /api/mcp-config`, plus the query wrapper
 * that reads the PRESERVED manifest (`!ENV` markers intact) and the auxiliary reads
 * feeding the pickers and the marker checklist.
 */
import { useQuery } from '@tanstack/react-query';
import { summarizeFleetFanout } from '@tai42/api-client';
import type { Extension, McpEnvRef } from '@tai42/api-client';
import {
  Badge,
  Button,
  Dialog,
  ErrorState,
  Field,
  FleetReport,
  Skeleton,
  Spinner,
  Textarea,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { JsonSchema } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  envConfigKey,
  installedMarketplacePluginsKey,
  mcpConfigSchemaKey,
  mcpEnvRefsKey,
  mcpExtensionsKey,
  mcpStatusKey,
  preservedManifestKey,
} from './keys';
import { asRecord } from './mcp-config-parse';
import { useMcpConfigDraft } from './mcp-config-draft';
import type { ConfigView } from './mcp-config-draft';
import { EntryList } from './mcp-entry-list';

/** The Form / JSON view toggle. */
function ConfigViewToggle({
  view,
  onSelect,
}: {
  readonly view: ConfigView;
  readonly onSelect: (next: ConfigView) => void;
}): ReactNode {
  return (
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
          onSelect('form');
        }}
      >
        Form
      </Button>
      <Button
        type="button"
        variant={view === 'json' ? 'primary' : 'secondary'}
        aria-pressed={view === 'json'}
        onClick={() => {
          onSelect('json');
        }}
      >
        JSON
      </Button>
    </div>
  );
}

/** The conflict banner: the server config moved under unsaved edits; the draft is kept
 *  and saving overwrites the server version (or discard to load the server's config). */
function ConflictBanner({
  onLoadServerVersion,
}: {
  readonly onLoadServerVersion: () => void;
}): ReactNode {
  return (
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
        <Button type="button" variant="secondary" onClick={onLoadServerVersion}>
          Discard my draft and load the server version
        </Button>
      </div>
    </div>
  );
}

/** The confirm before a view switch discards unsaved edits (converting the config
 *  across). */
function SwitchViewConfirmDialog({
  target,
  onCancel,
  onConfirm,
}: {
  readonly target: ConfigView | null;
  readonly onCancel: () => void;
  readonly onConfirm: (target: ConfigView) => void;
}): ReactNode {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Discard unsaved changes?"
      description="You have unsaved edits. Switching views converts the current config across; continue?"
    >
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)', justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            if (target !== null) onConfirm(target);
          }}
        >
          Switch view
        </Button>
      </div>
    </Dialog>
  );
}

function McpConfigEditor(props: {
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
  const draft = useMcpConfigDraft({ initialEntries: props.initialEntries });
  const { save } = draft;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <ConfigViewToggle view={draft.view} onSelect={draft.requestView} />

      {draft.conflict ? <ConflictBanner onLoadServerVersion={draft.loadServerVersion} /> : null}

      {draft.view === 'form' ? (
        <EntryList
          schema={props.schema}
          entries={draft.entries}
          discoveredTools={props.discoveredTools}
          extensions={props.extensions}
          extensionsError={props.extensionsError}
          availableSecretKeys={props.availableSecretKeys}
          keyPickingAvailable={props.keyPickingAvailable}
          dirty={draft.dirty}
          secretStoreBlockedReason={draft.secretStoreBlockedReason}
          installedMcpRefs={props.installedMcpRefs}
          refsByTitle={props.refsByTitle}
          onPasteSecret={draft.onPasteSecret}
          onChange={draft.setEntries}
        />
      ) : (
        <Field
          label="MCP config"
          description="A JSON array of server entries. Saving replaces the mounted MCP config."
          error={draft.parseError}
        >
          <Textarea
            value={draft.text}
            onChange={(event) => {
              draft.setText(event.currentTarget.value);
            }}
            rows={12}
            spellCheck={false}
            style={{ fontFamily: 'var(--tai-font-mono)' }}
          />
        </Field>
      )}

      {draft.canSave ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
          <Button
            type="button"
            variant="primary"
            onClick={draft.onSave}
            disabled={save.isPending || draft.secretStoreBlockedReason !== undefined}
          >
            Save config
          </Button>
          {/* What the disabled Save is waiting on, in words next to it: a disabled button
              holds no focus and a bare spinner names nothing. */}
          {save.isPending ? (
            <div role="status" className="tai-row">
              <Spinner label="" />
              <span>Saving config…</span>
            </div>
          ) : draft.secretEnvPending ? (
            <div role="status" className="tai-row">
              <Spinner label="" />
              <span>Storing secret…</span>
            </div>
          ) : null}
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
      {draft.secretEnvError ? <ErrorState message={errorMessage(draft.secretEnvErrorObj)} /> : null}

      <SwitchViewConfirmDialog
        target={draft.confirmTarget}
        onCancel={() => {
          draft.setConfirmTarget(null);
        }}
        onConfirm={(target) => {
          draft.switchTo(target);
          draft.setConfirmTarget(null);
        }}
      />
    </div>
  );
}

/** title → installed listing ref, from every installed plugin's mcp-server items. */
function buildInstalledMcpRefs(
  installed: { installed?: { ref: string; items: { kind: string; name: string }[] }[] } | undefined,
): Map<string, string> {
  const refs = new Map<string, string>();
  for (const row of installed?.installed ?? []) {
    for (const item of row.items) {
      if (item.kind === 'mcp-server') refs.set(item.name, row.ref);
    }
  }
  return refs;
}

/** title → its `!ENV` marker refs. The refs' `/mcp/<i>/...` pointer indexes the SAVED
 *  manifest, so map each ref's index back to that entry's title and group. */
function buildRefsByTitle(
  envRefs: readonly McpEnvRef[] | undefined,
  initialEntries: readonly unknown[],
): Map<string, McpEnvRef[]> {
  const byTitle = new Map<string, McpEnvRef[]>();
  for (const ref of envRefs ?? []) {
    const index = Number(ref.pointer.split('/')[2]);
    const title = asRecord(initialEntries[index]).title;
    if (typeof title !== 'string') continue;
    const existing = byTitle.get(title);
    if (existing === undefined) byTitle.set(title, [ref]);
    else existing.push(ref);
  }
  return byTitle;
}

export function McpConfigSection(): ReactNode {
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

  // A FAILED REFETCH NEVER TEARS THE EDITOR DOWN. The editor below holds the operator's
  // unsaved draft and the paste provenance the save-time orphan sweep reads, so replacing
  // it on a transient read failure (the reload gate answers 503 while the fleet reloads,
  // and these queries do not retry) would silently discard both. Only a read that has NO
  // data at all walls the section; a failure over last-good data is a banner above the
  // live editor.
  const readError = manifest.error ?? schema.error;
  const retryReads = (): void => {
    void manifest.refetch();
    void schema.refetch();
  };
  if (manifest.data === undefined || schema.data === undefined) {
    if (readError !== null)
      return <ErrorState message={errorMessage(readError)} onRetry={retryReads} />;
    return <Skeleton height={220} />;
  }

  const discoveredTools = status.isSuccess ? status.data.bound : {};
  const extensionsError = extensions.isError ? errorMessage(extensions.error) : undefined;
  const initialEntries = manifest.data.mcp;

  return (
    <>
      {readError === null ? null : (
        <ErrorState
          message={`${errorMessage(readError)}\nThe form below shows the last configuration read successfully.`}
          onRetry={retryReads}
        />
      )}
      <McpConfigEditor
        initialEntries={initialEntries}
        schema={schema.data}
        discoveredTools={discoveredTools}
        extensions={extensions.data ?? []}
        extensionsError={extensionsError}
        availableSecretKeys={envConfig.data?.secret_keys ?? []}
        keyPickingAvailable={envConfig.isSuccess}
        installedMcpRefs={buildInstalledMcpRefs(installed.data)}
        refsByTitle={buildRefsByTitle(envRefs.data, initialEntries)}
      />
    </>
  );
}

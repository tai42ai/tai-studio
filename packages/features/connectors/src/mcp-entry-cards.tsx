/**
 * The per-entry cards of the MCP config form view: connector-managed and
 * marketplace-installed entries render READ-ONLY with their provenance; a
 * hand-authored entry is editable (transport config + include/exclude composer +
 * masked secret fields for its `env` map).
 */
import type { ConnectorRef, Extension, McpEnvRef } from '@tai42/api-client';
import type { JsonSchema, RecordEntryContext, RecordEntryRenderer } from '@tai42/studio-sdk';
import {
  AppLink,
  Badge,
  Button,
  Card,
  RecordEntryRendererContext,
  SchemaForm,
  SecretRefField,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { asRecord, stringArray } from './mcp-config-parse';
import { formatEnvMarker, isEnvEntry, parseEnvMarker } from './mcp-env-markers';
import { ToolListEditor } from './mcp-tool-list-editor';

/**
 * The masked secret field for one `env`-map entry: it maps a `key` reference to the
 * `!ENV ${KEY}` leaf and a pasted secret to the combined env+manifest op targeted at
 * this entry's manifest pointer (head `mcp`). Pasting a NEW secret is safe only when
 * the editor index matches the saved manifest (no unsaved edits) and the entry already
 * has a key to hint the generated name; referencing an existing key stays available.
 */
function McpSecretField({
  recordEntry,
  index,
  availableSecretKeys,
  keyPickingAvailable,
  dirty,
  secretStoreBlockedReason,
  onPasteSecret,
}: {
  readonly recordEntry: RecordEntryContext;
  readonly index: number;
  readonly availableSecretKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly dirty: boolean;
  readonly secretStoreBlockedReason: string | undefined;
  readonly onPasteSecret: (manifestPointer: string, keyHint: string, secret: string) => void;
}): ReactNode {
  const referencedKey = parseEnvMarker(recordEntry.value);
  const pasteDisabledReason =
    secretStoreBlockedReason ??
    (dirty
      ? 'Save changes before adding a secret'
      : recordEntry.keyName.trim() === ''
        ? 'Name this variable before adding a secret'
        : undefined);
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

const READ_ONLY_CARD = { background: 'var(--tai-color-surface)' } as const;
const CARD_HEADER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-2)',
} as const;
const TITLE_TEXT = { fontWeight: 600, fontFamily: 'var(--tai-font-mono)' } as const;
const NOTE_TEXT = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
} as const;
const TOOL_BADGES = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 'var(--tai-space-1)',
  marginTop: 'var(--tai-space-2)',
};

/** The title of an entry, falling back to its 1-based position. */
function entryTitle(record: Record<string, unknown>, index: number): string {
  const rawTitle = record.title;
  return typeof rawTitle === 'string' && rawTitle !== '' ? rawTitle : `Server ${String(index + 1)}`;
}

/** The read-only header shared by the installed and managed cards: title, a status
 *  badge, and a disabled Remove. */
function ReadOnlyEntryHeader({
  title,
  badge,
  index,
}: {
  readonly title: string;
  readonly badge: string;
  readonly index: number;
}): ReactNode {
  return (
    <div style={CARD_HEADER}>
      <span style={TITLE_TEXT}>{title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
        <Badge variant="primary">{badge}</Badge>
        <Button
          type="button"
          variant="ghost"
          disabled
          aria-label={`Remove server ${String(index + 1)}`}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

/** The included-tool badges of a read-only entry, or nothing when it binds none. */
function IncludeBadges({ include }: { readonly include: readonly string[] }): ReactNode {
  if (include.length === 0) return null;
  return (
    <div style={TOOL_BADGES}>
      {include.map((tool) => (
        <Badge key={tool} variant="neutral">
          {tool}
        </Badge>
      ))}
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
export function InstalledEntryCard({
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
  return (
    <Card style={READ_ONLY_CARD}>
      <ReadOnlyEntryHeader title={entryTitle(record, index)} badge="Installed" index={index} />
      <p role="note" style={NOTE_TEXT}>
        Installed from {installedRef} — uninstall to remove
      </p>
      <IncludeBadges include={stringArray(record.include)} />
      <EnvRefsChecklist refs={refs} />
    </Card>
  );
}

/**
 * A connector-owned MCP entry, rendered READ-ONLY. Its scopes, tokens, and URLs
 * are kept in sync by the connection that wrote it, so the editor surfaces the
 * provenance and disables removal — the only way to remove it is to disconnect.
 */
export function ManagedEntryCard({
  entry,
  index,
  managed,
}: {
  readonly entry: unknown;
  readonly index: number;
  readonly managed: ConnectorRef;
}): ReactNode {
  const record = asRecord(entry);
  return (
    <Card style={READ_ONLY_CARD}>
      <ReadOnlyEntryHeader title={entryTitle(record, index)} badge="Managed" index={index} />
      <p role="note" style={NOTE_TEXT}>
        Managed by connection {managed.connection_id} (provider {managed.provider_id},{' '}
        {managed.sub_service}). Disconnect to remove.
      </p>
      <IncludeBadges include={stringArray(record.include)} />
    </Card>
  );
}

/** An editable, hand-authored MCP entry: transport config + include/exclude composer. */
export function EditableEntryCard({
  entry,
  index,
  formSchema,
  discoveredTools,
  extensions,
  extensionsError,
  availableSecretKeys,
  keyPickingAvailable,
  dirty,
  secretStoreBlockedReason,
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
  readonly secretStoreBlockedReason: string | undefined;
  readonly refs: readonly McpEnvRef[];
  readonly onPasteSecret: (manifestPointer: string, keyHint: string, secret: string) => void;
  readonly onChange: (next: unknown) => void;
  readonly onRemove: () => void;
}): ReactNode {
  const record = asRecord(entry);

  // The value renderer the schema-form consults for every `record` entry. Only the
  // MCP entry's `env` map is secret-bearing: those entries mount the masked
  // SecretRefField; every other map keeps the built-in value editor.
  const renderRecordEntry: RecordEntryRenderer = (recordEntry) =>
    isEnvEntry(recordEntry) ? (
      <McpSecretField
        recordEntry={recordEntry}
        index={index}
        availableSecretKeys={availableSecretKeys}
        keyPickingAvailable={keyPickingAvailable}
        dirty={dirty}
        secretStoreBlockedReason={secretStoreBlockedReason}
        onPasteSecret={onPasteSecret}
      />
    ) : (
      recordEntry.defaultField
    );

  return (
    <Card style={READ_ONLY_CARD}>
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
          variant="ghost"
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

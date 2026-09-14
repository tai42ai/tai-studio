/** Manifest / MCP section, env-ref and config-reload sub-clients. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

/**
 * Names to add to / remove from the manifest `api_tools` include and exclude
 * lists (`POST /api/api-tools`). Each field is a bare name list; the server
 * refuses a body whose four lists are all empty.
 */
export interface ApiToolsListsBody {
  readonly include_add?: string[];
  readonly include_remove?: string[];
  readonly exclude_add?: string[];
  readonly exclude_remove?: string[];
}

/**
 * Body for the combined env+manifest secret op (POST `/api/mcp-config/secret-env`).
 * The server generates the env key from `value` (shaping the name from `key_hint`),
 * then writes the env value and the literal `!ENV ${KEY}` manifest leaf at
 * `manifest_pointer` atomically. `manifest_pointer`'s head segment MUST be `mcp`
 * (the server refuses any other with a loud 400).
 */
export interface SetMcpSecretEnvBody {
  readonly value: string;
  readonly key_hint: string;
  readonly manifest_pointer: string;
}

export function manifestClient(t: Transport) {
  const { req } = t;
  return {
    getManifest: (signal?: AbortSignal) => req('/api/manifest', s.manifestView, { signal }),
    setMcpConfig: (mcp: unknown[]) =>
      req('/api/mcp-config', s.reloadConfigResult, { method: 'POST', body: { mcp } }),
    getMcpStatus: (signal?: AbortSignal) => req('/api/mcp-status', s.mcpStatus, { signal }),
    reloadMcp: (title: string) =>
      req(`/api/mcp-status/${encodeSegment(title)}/reload`, s.mcpReloadResult, {
        method: 'POST',
      }),

    // Granular manifest-section entry edits — add/replace or remove ONE entry by
    // title, leaving the rest of the section untouched (the surgical counterpart to
    // the whole-section `setMcpConfig`). Each crosses the config pipeline and returns
    // the shared apply-result (`status` + `env_keys` + fleet `fanout`). `replace` lets
    // an entry whose title already exists swap in; without it a collision is refused.
    addToolsEntries: (entries: readonly unknown[], replace = false) =>
      req('/api/tools-config/entries', s.reloadConfigResult, {
        method: 'POST',
        body: { entries, replace },
      }),
    removeToolsEntry: (title: string) =>
      req(`/api/tools-config/entries/${encodeSegment(title)}`, s.reloadConfigResult, {
        method: 'DELETE',
      }),
    addAgentsEntries: (entries: readonly unknown[], replace = false) =>
      req('/api/agents-config/entries', s.reloadConfigResult, {
        method: 'POST',
        body: { entries, replace },
      }),
    removeAgentsEntry: (title: string) =>
      req(`/api/agents-config/entries/${encodeSegment(title)}`, s.reloadConfigResult, {
        method: 'DELETE',
      }),
    // Edit the manifest `api_tools` include/exclude name lists by delta (add/remove
    // names on either list). Absent fields default to empty; the server refuses a body
    // whose four lists are all empty. Returns the shared apply-result.
    updateApiTools: (body: ApiToolsListsBody) =>
      req('/api/api-tools', s.reloadConfigResult, {
        method: 'POST',
        body: {
          include_add: body.include_add ?? [],
          include_remove: body.include_remove ?? [],
          exclude_add: body.exclude_add ?? [],
          exclude_remove: body.exclude_remove ?? [],
        },
      }),

    // The MCP servers skipped by the viability check, plus their remediation ops. The
    // LIST rides the fleet fan-out primitive (each worker's failed roster arrives as
    // its own report payload; `failedMcpsFromReport` unions them). Reload-all re-probes
    // every failed server; deregister detaches one server's tools by title. Each op
    // returns the bare per-worker `fleetResult`.
    listFailedMcps: (signal?: AbortSignal) =>
      req('/api/mcp-status/failed', s.fleetResult, { signal }),
    reloadFailedMcps: () =>
      req('/api/mcp-status/reload-failed', s.fleetResult, {
        method: 'POST',
        body: { targets: null },
      }),
    deregisterMcp: (title: string) =>
      req(`/api/mcp-status/${encodeSegment(title)}/deregister`, s.fleetResult, {
        method: 'POST',
        body: { targets: null },
      }),
  };
}

export function manifestSecretEnvClient(t: Transport) {
  const { req } = t;
  return {
    // The SecretRefField server half: one atomic env-value + `!ENV` manifest
    // write, returning the shared apply-result shape (reload + fleet fanout).
    setMcpSecretEnv: (body: SetMcpSecretEnvBody) =>
      req('/api/mcp-config/secret-env', s.reloadConfigResult, { method: 'POST', body }),
    // The PRESERVED manifest (`!ENV` markers intact, no resolved secrets) — the
    // connectors page's McpServersSection reads this so round-trips never inline
    // resolved values.
    getManifestPreserved: (signal?: AbortSignal) =>
      req('/api/manifest/preserved', s.manifestView, { signal }),
    // The manifest MCP section's `!ENV ${VAR[:default]}` marker refs — NAMES and
    // set/unset BOOLEANS only, never values. Drives the McpServersSection env-refs
    // checklist on the connectors page.
    getMcpEnvRefs: (signal?: AbortSignal) =>
      req('/api/manifest/mcp-env-refs', s.mcpEnvRefs, { signal }),
  };
}

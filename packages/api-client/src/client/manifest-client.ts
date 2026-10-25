/** Manifest / MCP section, per-server MCP ops, env-ref and config-reload sub-clients. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
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

/** The include/exclude tool filter of one MCP entry (`PUT .../tool-filter`). */
export interface McpToolFilter {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export function manifestClient(t: Transport) {
  const { req } = t;
  return {
    getManifest: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_manifest.path, s.manifestView, { signal }),
    setMcpConfig: (mcp: unknown[]) =>
      req(apiRoutes.post_api_mcp_config.path, s.reloadConfigResult, {
        method: 'POST',
        body: { mcp },
      }),
    // Granular manifest-section entry edits — add/replace or remove ONE entry by
    // title, leaving the rest of the section untouched (the surgical counterpart to
    // the whole-section `setMcpConfig`). Each crosses the config pipeline and returns
    // the shared apply-result (`status` + `env_keys` + fleet `fanout`). `replace` lets
    // an entry whose title already exists swap in; without it a collision is refused.
    addToolsEntries: (entries: readonly unknown[], replace = false) =>
      req(apiRoutes.post_api_tools_config_entries.path, s.reloadConfigResult, {
        method: 'POST',
        body: { entries, replace },
      }),
    removeToolsEntry: (title: string) =>
      req(
        buildPath(apiRoutes.delete_api_tools_config_entries_title.path, { title }),
        s.reloadConfigResult,
        {
          method: 'DELETE',
        },
      ),
    addAgentsEntries: (entries: readonly unknown[], replace = false) =>
      req(apiRoutes.post_api_agents_config_entries.path, s.reloadConfigResult, {
        method: 'POST',
        body: { entries, replace },
      }),
    removeAgentsEntry: (title: string) =>
      req(
        buildPath(apiRoutes.delete_api_agents_config_entries_title.path, { title }),
        s.reloadConfigResult,
        {
          method: 'DELETE',
        },
      ),
    // Edit the manifest `api_tools` include/exclude name lists by delta (add/remove
    // names on either list). Absent fields default to empty; the server refuses a body
    // whose four lists are all empty. Returns the shared apply-result.
    updateApiTools: (body: ApiToolsListsBody) =>
      req(apiRoutes.post_api_api_tools.path, s.reloadConfigResult, {
        method: 'POST',
        body: {
          include_add: body.include_add ?? [],
          include_remove: body.include_remove ?? [],
          exclude_add: body.exclude_add ?? [],
          exclude_remove: body.exclude_remove ?? [],
        },
      }),
  };
}

/** Per-server MCP status reads and live ops: status, advertised tools, tool filter, reloads. */
export function mcpServersClient(t: Transport) {
  const { req } = t;
  return {
    getMcpStatus: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_mcp_status.path, s.mcpStatus, { signal }),
    // Every tool the server advertises, before the entry's tool filter. A POST: the
    // read opens a session to the server.
    listMcpAdvertisedTools: (title: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.post_api_mcp_status_title_advertised_tools.path, { title }),
        s.mcpAdvertisedTools,
        { method: 'POST', signal },
      ),
    // Replace the entry's include/exclude tool filter; crosses the config pipeline.
    setMcpToolFilter: (title: string, filter: McpToolFilter) =>
      req(
        buildPath(apiRoutes.put_api_mcp_config_entries_title_tool_filter.path, { title }),
        s.reloadConfigResult,
        { method: 'PUT', body: filter },
      ),
    reloadMcp: (title: string) =>
      req(
        buildPath(apiRoutes.post_api_mcp_status_title_reload.path, { title }),
        s.mcpReloadResult,
        {
          method: 'POST',
        },
      ),

    // The MCP servers skipped by the viability check, plus their remediation ops. The
    // LIST rides the fleet fan-out primitive (each worker's failed roster arrives as
    // its own report payload; `failedMcpsFromReport` unions them). Reload-all re-probes
    // every failed server; deregister detaches one server's tools by title. Each op
    // returns the bare per-worker `fleetResult`.
    listFailedMcps: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_mcp_status_failed.path, s.fleetResult, { signal }),
    reloadFailedMcps: () =>
      req(apiRoutes.post_api_mcp_status_reload_failed.path, s.fleetResult, {
        method: 'POST',
        body: { targets: null },
      }),
    deregisterMcp: (title: string) =>
      req(
        buildPath(apiRoutes.post_api_mcp_status_title_deregister.path, { title }),
        s.fleetResult,
        {
          method: 'POST',
          body: { targets: null },
        },
      ),
  };
}

export function manifestSecretEnvClient(t: Transport) {
  const { req } = t;
  return {
    // The SecretRefField server half: one atomic env-value + `!ENV` manifest
    // write, returning the shared apply-result shape (reload + fleet fanout).
    setMcpSecretEnv: (body: SetMcpSecretEnvBody) =>
      req(apiRoutes.post_api_mcp_config_secret_env.path, s.reloadConfigResult, {
        method: 'POST',
        body,
      }),
    // The PRESERVED manifest (`!ENV` markers intact, no resolved secrets) — the
    // connectors page's McpServersSection reads this so round-trips never inline
    // resolved values.
    getManifestPreserved: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_manifest_preserved.path, s.manifestView, { signal }),
    // The manifest MCP section's `!ENV ${VAR[:default]}` marker refs — NAMES and
    // set/unset BOOLEANS only, never values. Drives the McpServersSection env-refs
    // checklist on the connectors page.
    getMcpEnvRefs: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_manifest_mcp_env_refs.path, s.mcpEnvRefs, { signal }),
  };
}

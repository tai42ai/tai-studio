---
'@tai42/api-client': minor
'@tai42/studio-sdk': minor
'@tai42/feature-system': minor
'@tai42/feature-tools': minor
'@tai42/feature-manifest': minor
'@tai42/feature-settings': minor
'@tai42/feature-connectors': minor
---

Fleet-surface rework: point the Studio at the app worker bus (clean break, no
compat shims).

- **api-client**: `listBackendWorkers` → `listFleetWorkers` (`GET /api/fleet/workers`,
  the bus presence census of every subscribed origin — ASGI `serve` + backend
  runtime) and `reloadBackendConfig` → `reloadFleetConfig`
  (`POST /api/fleet/reload-config`, the per-origin fleet report). `getBackendInfo`
  (`GET /api/backend`, identity) is kept. New `fleetWorkers` / `fleetResult` /
  `fleetReloadResult` / `mcpReloadResult` schemas and a mode-wrapped
  `fleetReportFanout`, explicitly parsed into every mutation response that embeds it
  (mcp-config, env, tool-extensions, single-MCP reload, backup manifest/env sections,
  and the connector mutations) so a fleet failure is never silently stripped. The
  tool-extensions apply result drops the old `{ local, workers }` union.
- **shared fleet-report handler**: `summarizeFleetFanout` /
  `summarizeFleetResult` in api-client + a `FleetReport` component in studio-sdk render
  a broadcast's honest failure states (`failed` / `missing` / `departed` /
  `timed_out`, and bus-unreachable) as a loud, user-visible state on every mutation
  surface — never faked success on a stranded origin.
- **features**: SystemPage's WorkersCard + reload dialog move to the fleet routes and
  render the per-origin report; ToolExtensionsCard, the MCP config/reload tabs, the
  env tab, backup restore, and the connector flows surface the shared report.

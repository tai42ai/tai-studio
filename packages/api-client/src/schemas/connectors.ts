/** Connector provider catalog and connection lifecycle schemas. */
import { z } from 'zod';

import { fleetReportFanout } from './fleet';

export const subServiceView = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string(),
  scopes: z.array(z.string()),
});

export const configFieldView = z.object({
  key: z.string(),
  label: z.string(),
  target: z.enum(['env', 'header']),
  required: z.boolean(),
  secret: z.boolean(),
});

export const providerView = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string(),
  // Required and a real URL: the contract's `ProviderDescriptor.icon_url` runs
  // `check_web_url(schemes=("https",))`, which rejects an empty/relative value, so
  // an empty or malformed one here is drift and fails the parse loudly.
  icon_url: z.url(),
  kind: z.enum(['oauth', 'none']),
  origin: z.enum(['system', 'community']),
  category: z.string(),
  sub_services: z.array(subServiceView),
  config_fields: z.array(configFieldView),
});
export type ProviderView = z.infer<typeof providerView>;

/**
 * One `connector_category` grouping row served alongside the catalog: the UI's
 * label and sort key for the providers it groups, so the list can group, order,
 * and label providers by category without a second read.
 */
export const connectorCategoryView = z.object({
  id: z.string(),
  display_name: z.string(),
  sort_order: z.number(),
});
export type ConnectorCategoryView = z.infer<typeof connectorCategoryView>;

/**
 * `GET /api/connectors/providers` — the provider catalog: the providers plus the
 * category groupings the UI arranges them under. Reshaped from a bare provider
 * array so the category label/order surface rides the same read.
 */
export const providers = z.object({
  providers: z.array(providerView),
  categories: z.array(connectorCategoryView),
});
export type ProviderCatalogResponse = z.infer<typeof providers>;

export const connectionView = z.object({
  connection_id: z.string(),
  provider_id: z.string(),
  alias: z.string(),
  kind: z.enum(['oauth', 'none']),
  account_identity: z.string().nullable(),
  enabled_sub_services: z.array(z.string()),
  granted_scopes: z.array(z.string()),
  // Sub-services whose MCP server did not answer a live reachability probe.
  // Populated only on the single-connection GET (the list projection is
  // probe-free and always sends `[]`). Reachability is distinct from
  // `auth_health_state`: a healthy connection can still have a down sub-service.
  // Defaulted so a projection that omits it (an older worker mid-rollout) still
  // parses rather than false-failing the whole view.
  unreachable_sub_services: z.array(z.string()).default([]),
  auth_health_state: z.enum(['healthy', 'reconnect_required', 'refresh_failing']),
  created_at: z.string(),
});
export type ConnectionView = z.infer<typeof connectionView>;

export const connectionsList = z.object({
  items: z.array(connectionView),
  total: z.number(),
  // Count of connections whose `auth_health_state` is not healthy across the whole
  // set (independent of any filter/limit) — the attention-badge count. Optional:
  // no UI consumes it, and an older worker mid-rollout omits it.
  unhealthy: z.number().optional(),
});

// A connector mutation that writes the manifest embeds the mode-wrapped fleet
// `fanout` of the reload it broadcast; it is `null` when the response path mutated no
// manifest (an OAuth START opens a flow before any write). Parsed EXPLICITLY so the
// shared fleet-report handler surfaces a failed propagation on every connector flow —
// zod's unknown-key stripping would otherwise drop it silently.
export const startConnectResult = z.union([
  z.object({ flow_id: z.string(), authorize_url: z.string() }),
  z.object({
    connection_id: z.string(),
    added_manifest_entries: z.array(z.string()),
    fanout: fleetReportFanout.nullable(),
  }),
]);

// A reconnect START opens an OAuth flow and writes no manifest, so it carries no
// fan-out (the manifest write lands when the flow completes).
export const reconnectResult = z.object({ flow_id: z.string(), authorize_url: z.string() });

export const disconnectResult = z.object({
  connection_id: z.string(),
  upstream_revoke_outcome: z.enum(['success', 'failed', 'skipped']),
  upstream_revoke_status: z.number().nullable(),
  removed_manifest_entries: z.array(z.string()),
  fanout: fleetReportFanout.nullable(),
});

export const patchSubServicesResult = z.object({
  connection_id: z.string(),
  enabled_sub_services: z.array(z.string()),
  consent_required: z.boolean(),
  flow_id: z.string().nullable(),
  authorize_url: z.string().nullable(),
  added_manifest_entries: z.array(z.string()),
  removed_manifest_entries: z.array(z.string()),
  // `null` on a consent-only toggle that forks an OAuth flow without a manifest write.
  fanout: fleetReportFanout.nullable(),
});

export const oauthCompleteResult = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('success'),
    connection_id: z.string(),
    return_url: z.string(),
    // `null` when completing the flow mutated no manifest (a reconcile that changed
    // nothing).
    fanout: fleetReportFanout.nullable(),
  }),
  z.object({ kind: z.literal('failed'), reason: z.string() }),
  z.object({ kind: z.literal('cancelled'), message: z.string() }),
]);
export type OAuthCompleteResult = z.infer<typeof oauthCompleteResult>;
